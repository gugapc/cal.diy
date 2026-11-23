#!/usr/bin/env bash
# Executa o Coding Agent (Claude Code) em modo headless sobre este fork.
#
# Uso:
#   scripts/agent/run-task.sh "<descrição da tarefa>" [args extras para o claude...]
#
# Cada execução grava em scripts/agent/runs/<timestamp>/:
#   output.json  JSON cru emitido por `claude -p --output-format json`
#   result.md    texto do campo `result` (vazio se o JSON não tiver esse campo)
#   stderr.log   stderr do claude + motivo da falha, quando houver
#   status.json  veredito (success|failure) e motivo
#
# Sai com 0 quando a execução foi concluída com sucesso e com código diferente
# de zero quando falhou. Veja scripts/agent/README.md.

set -u -o pipefail

log() { printf '[run-task] %s\n' "$*" >&2; }

usage() {
  cat >&2 <<'EOF'
Uso: scripts/agent/run-task.sh "<descrição da tarefa>" [args extras para o claude...]

Exemplos:
  scripts/agent/run-task.sh "Explique o que faz scripts/start.sh"
  scripts/agent/run-task.sh "Corrija o typo no README" --permission-mode acceptEdits
EOF
}

if [ "$#" -lt 1 ] || [ -z "$1" ]; then
  usage
  exit 2
fi

TASK="$1"
shift

if ! command -v jq >/dev/null 2>&1; then
  log "jq não encontrado no PATH; ele é necessário para ler o JSON do claude."
  exit 127
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNS_DIR="$SCRIPT_DIR/runs"

# Timestamp em UTC (neutro, independente do fuso da máquina). Se duas execuções
# caírem no mesmo segundo, acrescenta um sufixo em vez de sobrescrever.
TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RUNS_DIR"
RUN_DIR="$RUNS_DIR/$TS"
n=1
until mkdir "$RUN_DIR" 2>/dev/null; do
  n=$((n + 1))
  RUN_DIR="$RUNS_DIR/$TS-$n"
done

RAW="$RUN_DIR/output.json"
RESULT="$RUN_DIR/result.md"
ERR="$RUN_DIR/stderr.log"
STATUS="$RUN_DIR/status.json"

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "Executando no diretório $REPO_DIR"
log "Saída em $RUN_DIR"

# A tarefa vai como um único argumento (nunca interpolada em string de shell).
# Os args extras vêm antes de --output-format json para que este prevaleça e
# para que uma opção variádica do usuário (ex.: --allowedTools) não engula nada.
# stdin vem de /dev/null para o claude não esperar entrada.
(
  cd "$REPO_DIR" || exit 1
  exec claude -p "$TASK" "$@" --output-format json
) >"$RAW" 2>"$ERR" </dev/null
EXIT_CODE=$?

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

VERDICT="success"
FAILED_CHECK=""
REASON="Execução concluída: exit code 0, JSON válido, is_error=false e subtype=success."
JSON_OK=false

# Verificação 1: código de saída do processo.
if [ "$EXIT_CODE" -ne 0 ]; then
  VERDICT="failure"
  FAILED_CHECK="exit_code"
  REASON="O processo claude saiu com código $EXIT_CODE."
fi

# Verificação 2: o JSON parseou (e é um objeto).
if jq -e 'type == "object"' "$RAW" >/dev/null 2>&1; then
  JSON_OK=true
elif [ "$VERDICT" = "success" ]; then
  VERDICT="failure"
  FAILED_CHECK="json_parse"
  if [ ! -s "$RAW" ]; then
    REASON="A saída do claude veio vazia; não há JSON para ler."
  else
    REASON="A saída do claude não é um objeto JSON válido."
  fi
fi

IS_ERROR="null"
SUBTYPE="null"
if [ "$JSON_OK" = true ]; then
  IS_ERROR="$(jq -c '.is_error' "$RAW")"
  SUBTYPE="$(jq -c '.subtype' "$RAW")"
  # result.md recebe o texto cru do campo result, quando ele existir.
  jq -r 'if (.result | type) == "string" then .result else empty end' "$RAW" >"$RESULT"

  # Verificação 3: is_error == false e subtype == "success".
  if [ "$VERDICT" = "success" ] &&
    ! jq -e '.is_error == false and .subtype == "success"' "$RAW" >/dev/null; then
    VERDICT="failure"
    FAILED_CHECK="result_status"
    REASON="O JSON indica falha: is_error=$IS_ERROR, subtype=$SUBTYPE (esperado is_error=false, subtype=\"success\")."
  fi
else
  : >"$RESULT"
fi

jq -n \
  --arg verdict "$VERDICT" \
  --arg reason "$REASON" \
  --arg failed_check "$FAILED_CHECK" \
  --argjson exit_code "$EXIT_CODE" \
  --argjson json_parsed "$JSON_OK" \
  --argjson is_error "$IS_ERROR" \
  --argjson subtype "$SUBTYPE" \
  --arg task "$TASK" \
  --arg started_at "$STARTED_AT" \
  --arg finished_at "$FINISHED_AT" \
  '{
    verdict: $verdict,
    reason: $reason,
    failed_check: (if $failed_check == "" then null else $failed_check end),
    exit_code: $exit_code,
    json_parsed: $json_parsed,
    is_error: $is_error,
    subtype: $subtype,
    task: $task,
    started_at: $started_at,
    finished_at: $finished_at,
    files: {
      raw_json: "output.json",
      result: "result.md",
      stderr: "stderr.log",
      status: "status.json"
    }
  }' >"$STATUS"

if [ "$VERDICT" = "success" ]; then
  log "SUCESSO: $REASON"
  log "Resultado: $RESULT"
  exit 0
fi

printf '[run-task] FALHA (%s): %s\n' "$FAILED_CHECK" "$REASON" >>"$ERR"
log "FALHA ($FAILED_CHECK): $REASON"
log "Detalhes: $STATUS e $ERR"
if [ "$EXIT_CODE" -ne 0 ]; then
  exit "$EXIT_CODE"
fi
exit 1
