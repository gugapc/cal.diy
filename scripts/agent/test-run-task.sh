#!/usr/bin/env bash
# Testa scripts/agent/run-task.sh com um `claude` falso na PATH, sem custo e
# sem chamar o agente de verdade.
#
# Uso:
#   scripts/agent/test-run-task.sh
#
# Cobre os cinco caminhos (sucesso, saída diferente de zero, JSON inválido,
# exit 0 com is_error true, saída vazia com exit 0) e repete a saída vazia com
# um jq que sai com 0 quando não produz resultado. Em cada caso confere o
# veredito, o failed_check e o código de saída do run-task.sh. Sai com 0 só se
# todos passarem.

set -u -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_TASK="$SCRIPT_DIR/run-task.sh"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/run-task-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

STUB_BIN="$WORK/bin"
mkdir -p "$STUB_BIN"

# claude falso: o comportamento vem de STUB_MODE.
cat >"$STUB_BIN/claude" <<'EOF'
#!/usr/bin/env bash
case "${STUB_MODE:-}" in
  success)
    printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"Tarefa concluída."}'
    exit 0 ;;
  nonzero)
    echo "erro simulado do claude" >&2
    exit 3 ;;
  invalid-json)
    printf '%s\n' 'isto não é JSON {'
    exit 0 ;;
  is-error)
    printf '%s\n' '{"type":"result","subtype":"success","is_error":true,"result":"## Tudo certo!\n\nA tarefa foi concluída com sucesso. ✅"}'
    exit 0 ;;
  empty)
    exit 0 ;;
  *)
    echo "STUB_MODE desconhecido: ${STUB_MODE:-<vazio>}" >&2
    exit 99 ;;
esac
EOF
chmod +x "$STUB_BIN/claude"

# jq "permissivo": repassa tudo ao jq real, mas troca o exit 4 (sem resultado,
# ex.: `jq -e` com entrada vazia) por 0, como fazem algumas versões. Garante que
# o caso de saída vazia falha mesmo se o run-task.sh voltar a confiar no exit
# status do jq, qualquer que seja o jq instalado nesta máquina.
REAL_JQ="$(command -v jq || true)"
if [ -z "$REAL_JQ" ]; then
  echo "jq não encontrado no PATH; ele é necessário para o run-task.sh e para este teste." >&2
  exit 127
fi
LENIENT_JQ_BIN="$WORK/lenient-jq"
mkdir -p "$LENIENT_JQ_BIN"
cat >"$LENIENT_JQ_BIN/jq" <<EOF
#!/usr/bin/env bash
"$REAL_JQ" "\$@"
rc=\$?
[ "\$rc" -eq 4 ] && exit 0
exit "\$rc"
EOF
chmod +x "$LENIENT_JQ_BIN/jq"

PASSED=0
FAILED=0

# run_case <nome> <stub_mode> <verdict esperado> <failed_check esperado> <exit esperado> [dir extra na frente da PATH]
run_case() {
  local name="$1" mode="$2" want_verdict="$3" want_check="$4" want_exit="$5" extra_path="${6:-}"
  local id="$mode${extra_path:+-$(basename "$extra_path")}"
  local runs="$WORK/runs-$id"
  local errors=()
  local path="$STUB_BIN:$PATH"
  if [ -n "$extra_path" ]; then
    path="$extra_path:$path"
  fi

  STUB_MODE="$mode" RUN_TASK_RUNS_DIR="$runs" PATH="$path" \
    bash "$RUN_TASK" "tarefa de teste: $name" >"$WORK/$id.out" 2>"$WORK/$id.err"
  local got_exit=$?

  local run_dir status got_verdict="" got_check=""
  run_dir="$(find "$runs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)"
  status="$run_dir/status.json"

  if [ -z "$run_dir" ]; then
    errors+=("nenhuma pasta de execução criada em $runs")
  elif [ ! -s "$status" ]; then
    errors+=("status.json ausente ou vazio")
  else
    got_verdict="$(jq -r '.verdict' "$status" 2>/dev/null)"
    got_check="$(jq -r '.failed_check' "$status" 2>/dev/null)"
    [ "$got_verdict" = "$want_verdict" ] || errors+=("verdict: esperado '$want_verdict', veio '$got_verdict'")
    [ "$got_check" = "$want_check" ] || errors+=("failed_check: esperado '$want_check', veio '$got_check'")
  fi
  [ "$got_exit" = "$want_exit" ] || errors+=("exit: esperado $want_exit, veio $got_exit")

  if [ "${#errors[@]}" -eq 0 ]; then
    PASSED=$((PASSED + 1))
    printf 'ok    %-28s verdict=%s failed_check=%s exit=%s\n' "$name" "$got_verdict" "$got_check" "$got_exit"
  else
    FAILED=$((FAILED + 1))
    printf 'FALHA %-28s\n' "$name"
    local e
    for e in "${errors[@]}"; do
      printf '        - %s\n' "$e"
    done
    printf '        stderr do run-task.sh:\n'
    sed 's/^/          /' "$WORK/$id.err"
  fi
}

run_case "sucesso"                    success      success null          0
run_case "saída diferente de zero"    nonzero      failure exit_code     3
run_case "JSON inválido"              invalid-json failure json_parse    1
run_case "exit 0 com is_error true"   is-error     failure result_status 1
run_case "saída vazia com exit 0"     empty        failure json_parse    1
run_case "saída vazia, jq permissivo" empty        failure json_parse    1 "$LENIENT_JQ_BIN"

echo
echo "$PASSED passaram, $FAILED falharam."
[ "$FAILED" -eq 0 ]
