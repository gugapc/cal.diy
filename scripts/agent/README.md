# scripts/agent — headless command for the Coding Agent

`run-task.sh` runs Claude Code on this fork in headless mode
(`claude -p --output-format json`), with no interactive session, and saves the
result, the error and a verdict for each run.

## Prerequisites

- `claude` on the `PATH`, authenticated (the usual login is enough; no
  `ANTHROPIC_API_KEY` needed).
- `jq` on the `PATH` (macOS ships it at `/usr/bin/jq`).

The script **does not use `--bare`**, so the agent loads the project's
`CLAUDE.md`, the skills in `.claude/skills/` and the settings in `.claude/`,
just as it would in an interactive session.

## How to run

```bash
scripts/agent/run-task.sh "<task description>" [extra args for claude...]
```

- The **first parameter** is the task. To change the task, change the argument;
  the script is never edited. Quote the task: it reaches `claude` as a single
  argument, with spaces, quotes and `$` preserved (it is never interpolated into
  a shell string).
- **Everything after the task** is passed through to `claude` unchanged.
- The agent always runs from the repository root, whatever directory you call
  the script from.
- stdin is closed (`</dev/null`), so the agent never waits for input.

Examples:

```bash
# Read-only task
scripts/agent/run-task.sh "Explain what scripts/start.sh does"

# Task that edits files: in headless mode nobody is there to approve tools,
# so pass the permission mode you want
scripts/agent/run-task.sh "Fix the typo in README.md" --permission-mode acceptEdits

# Limit tools, turns or model
scripts/agent/run-task.sh "List the TODOs in packages/lib" --allowedTools Read Grep --max-turns 5
```

> **Permissions:** the script sets no permission mode on its own. Without
> `--permission-mode` / `--allowedTools`, a tool that would need approval is
> denied and appears in `permission_denials` in `output.json`.
>
> `--output-format json` is always added by the script after your args, so it
> wins over any `--output-format` you pass.

## Where the result and the error go

Each run creates `scripts/agent/runs/<timestamp>/`, with the timestamp in UTC
(`20261123T144942Z`). If two runs start in the same second, the second one gets
a suffix (`…Z-2`).

| File          | Contents                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| `output.json` | Raw JSON written by `claude` to stdout, unchanged.                       |
| `result.md`   | Text of the `result` field (the agent's final answer, in markdown). Empty when the JSON has no `result`. |
| `stderr.log`  | `claude`'s stderr. On failure, ends with a `[run-task] FALHA (<check>): <reason>` line. |
| `status.json` | Verdict and reason (see below).                                          |

`scripts/agent/runs/` is in `.gitignore`: day-to-day runs stay local. To write
the runs somewhere else, set `RUN_TASK_RUNS_DIR` (the test uses this to avoid
filling up `runs/`):

```bash
RUN_TASK_RUNS_DIR=/tmp/my-runs scripts/agent/run-task.sh "…"
```

In the terminal, the script prints the run folder and the verdict to stderr,
prefixed with `[run-task]`.

## How to read status.json

```json
{
  "verdict": "failure",
  "reason": "O processo claude saiu com código 1.",
  "failed_check": "exit_code",
  "exit_code": 1,
  "json_parsed": true,
  "is_error": true,
  "subtype": "error_max_turns",
  "task": "…",
  "started_at": "2026-11-23T14:49:59Z",
  "finished_at": "2026-11-23T14:50:03Z",
  "files": { "raw_json": "output.json", "result": "result.md", "stderr": "stderr.log", "status": "status.json" }
}
```

| Field          | Meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `verdict`      | `"success"` or `"failure"`. This is the field to read.                   |
| `reason`       | Human-readable reason for the verdict.                                   |
| `failed_check` | First check that failed: `"exit_code"`, `"json_parse"` or `"result_status"`. `null` on success. |
| `exit_code`    | Exit code of the `claude` process.                                       |
| `json_parsed`  | Whether `output.json` is a valid JSON object.                            |
| `is_error`     | Copy of `is_error` from the JSON (`null` if it did not parse).           |
| `subtype`      | Copy of `subtype` from the JSON, e.g. `"success"`, `"error_max_turns"` (`null` if it did not parse). |
| `task`         | Task exactly as it was passed in.                                        |
| `started_at` / `finished_at` | Start and end in UTC (ISO 8601).                           |

### How the verdict is decided

The checks run in this order, and the **first** one that fails sets
`failed_check` and `reason`:

1. **`exit_code`**: the `claude` process exited with a non-zero code.
2. **`json_parse`**: stdout is empty, is not valid JSON, or is not
   **exactly one** JSON object.
3. **`result_status`**: the JSON does not have `is_error == false` **and**
   `subtype == "success"`.

If all three pass, `verdict` is `"success"`. Even when the run fails at check 1,
the fields that could be read (`is_error`, `subtype`, `result.md`) are still
filled in, to help with diagnosis.

None of these checks relies on `jq`'s exit status. With empty input, `jq` may
produce no output at all and, depending on the version, exit 0, which used to
let an empty output pass as success. The script always compares the value `jq`
prints (`"object"`, `"true"`), and a field whose extraction comes back empty
becomes `null`.

If `status.json` itself cannot be written, the script **fails** with
`[run-task] FALHA (status_write): …` in `stderr.log` and a non-zero exit code,
and leaves no partial `status.json` behind.

### Script exit code

| Code     | When                                                             |
| -------- | ---------------------------------------------------------------- |
| `0`      | `verdict: "success"`.                                            |
| `claude`'s code | Failure at check 1 (e.g. `1`).                            |
| `1`      | Failure at check 2 or 3 (`claude` exited 0, but the result is a failure), or `status.json` could not be written. |
| `2`      | Wrong usage (no task). No run folder is created.                 |
| `127`    | `jq` not found. No run folder is created.                        |

Example use in CI or another script:

```bash
if scripts/agent/run-task.sh "…"; then
  echo "ok"
else
  jq -r '.reason' "$(ls -d scripts/agent/runs/*/ | tail -1)status.json"
fi
```

## Tests (`test-run-task.sh`)

```bash
scripts/agent/test-run-task.sh
```

The test runs `run-task.sh` with a **fake `claude`** put first on the `PATH`, so
it costs nothing and never calls the real agent. The runs are written to a
temporary directory (through `RUN_TASK_RUNS_DIR`) that is deleted at the end.
For each case it checks the `verdict`, the `failed_check` and the script's exit
code:

| Case                           | Fake `claude`                                         | Expected                          |
| ------------------------------ | ----------------------------------------------------- | --------------------------------- |
| success                        | exit 0, `is_error: false`, `subtype: "success"`       | `success`, `null`, exit 0         |
| non-zero exit                  | exit 3, no stdout                                     | `failure`, `exit_code`, exit 3    |
| invalid JSON                   | exit 0, stdout is not JSON                            | `failure`, `json_parse`, exit 1   |
| exit 0 with `is_error` true    | exit 0, `is_error: true` and a nice `result`          | `failure`, `result_status`, exit 1 |
| empty output with exit 0       | exit 0, no stdout                                     | `failure`, `json_parse`, exit 1   |
| empty output, lenient jq       | exit 0, no stdout, with the lenient `jq` (see below) on the `PATH` | `failure`, `json_parse`, exit 1   |

The last case puts a **lenient `jq`** first on the `PATH`. It passes everything
to the real `jq`, but turns exit 4 (no result, e.g. `jq -e` on empty input)
into 0, which is how some `jq` versions behave. With the `jq` shipped with
macOS (`jq-1.7.1-apple`), `jq -e` on empty input already exits 4, so without
this case the suite would not notice if `run-task.sh` went back to trusting
`jq`'s exit status. That mistake once let an empty output pass as success
without writing `status.json`.

It prints `ok` or `FALHA` per case, with the reason and the `run-task.sh`
stderr for the ones that fail, and exits 0 only if all six pass.

## Evidence (`evidence/`)

`scripts/agent/evidence/` is versioned and holds the verification runs, copied
from the run folder without changes.

### Real runs (real `claude`)

- `evidence/success/` is a real success run. The answer comes from the
  project's `CLAUDE.md`, which shows that the project context is loaded (no
  `--bare`):

  ```bash
  scripts/agent/run-task.sh 'Segundo as instruções do CLAUDE.md deste projeto, qual fuso deve ser usado como "fallback" quando a detecção falha? Responda em uma frase, sem usar ferramentas.'
  ```

- `evidence/failure/` is a real failure run. `--max-turns 1` (an extra arg
  passed through to `claude`) stops the agent before it can answer: `claude`
  exits with 1 and `subtype: "error_max_turns"`, and the script records
  `failed_check: "exit_code"` and exits 1.

  ```bash
  scripts/agent/run-task.sh 'Leia o arquivo scripts/agent/run-task.sh com a ferramenta Read e resuma em uma frase o que ele faz.' --max-turns 1
  ```

### Fake `claude` run

- `evidence/stub-result-status/` **was produced with a fake `claude`, not with
  the real agent.** It shows the check that the exit code alone does not catch:
  the fake `claude` exits **0** and prints a nice `result`
  (`## Tudo certo! … ✅`, saved in `result.md`), but with `is_error: true`. The
  script still records `verdict: "failure"`, `failed_check: "result_status"`
  and exits 1. It was generated like this:

  ```bash
  STUB=$(mktemp -d)
  cat > "$STUB/claude" <<'EOF'
  #!/usr/bin/env bash
  printf '%s\n' '{"type":"result","subtype":"success","is_error":true,"result":"## Tudo certo!\n\nA tarefa foi concluída com sucesso. ✅"}'
  exit 0
  EOF
  chmod +x "$STUB/claude"
  PATH="$STUB:$PATH" scripts/agent/run-task.sh "Demonstração com claude falso: exit 0, is_error true e um result bonito"
  ```
