# scripts/pr-approval — PR auto-approval policy and controller

A pull request is auto-approved only when **code** says so: `evaluate.mjs` applies
`policy.json` to an evidence file and records the decision. The agent's skill
(`.claude/skills/pr-autoapproval/`) only collects evidence with `collect.mjs`, runs the
controller and presents its output. It never judges.

| File | Role |
| --- | --- |
| `policy.json` | The policy: allowed paths, diff limits, required checks, what forces human review. |
| `collect.mjs` | Collector. Writes the evidence and decides nothing. |
| `evaluate.mjs` | Controller. Reads policy and evidence, re-reads git, decides, records. |
| `*.test.mjs`, `test-helpers.mjs` | `node --test` suite, using throwaway git repos. |
| `decisions/` | Evidence and decision records of day-to-day runs (gitignored). |
| `evidence/` | Versioned records of the reference runs (one rejected, one approved). |

Requires only `node` (≥ 20) and `git`. No dependencies.

## Usage

```bash
node scripts/pr-approval/collect.mjs init --pr 7            # prints the evidence path
node scripts/pr-approval/collect.mjs run-checks --evidence <path>
node scripts/pr-approval/evaluate.mjs --evidence <path> [--json]
```

All three accept `--policy <file>` and `--repo <dir>`. `evaluate.mjs` also accepts
`--decisions-dir <dir>`.

| Exit code | `collect.mjs` | `evaluate.mjs` |
| --- | --- | --- |
| 0 | done (whatever the checks returned) | approved |
| 1 | collection error (dirty tree, fetch failed, could not restore the checkout) | rejected |
| 2 | usage error | usage error or invalid policy |
| 130 / 143 | interrupted by SIGINT / SIGTERM, after restoring the checkout | — |

## The policy (`policy.json`)

- `remote`, `baseBranch`: where the PR lives (`git ls-remote <remote> refs/pull/<n>/head`)
  and what it is diffed against (merge-base with `<remote>/<baseBranch>`).
- `allowedPaths`: every changed file must match one of these globs (`**`, `*`, `?`).
- `maxDiff.lines` (additions + deletions) and `maxDiff.files`.
- `requiredChecks`: `{ id, command }`. `{changedFiles}` expands to the added and modified
  files, sorted and shell-quoted. The controller expands it again and requires the
  recorded command to match **exactly**.
- `humanReview.paths`: globs that always send the PR to a human, even when they also
  match `allowedPaths`: this directory, `.claude/**` (skills and settings guide the
  agent), `CLAUDE.md`, CI, Prisma, dependency manifests and env files.
  `humanReview.rules` lists in prose every situation that ends in human review.

The policy protects itself: a PR touching `scripts/pr-approval/**` can never be
auto-approved.

## Evidence format

```jsonc
{
  "schemaVersion": 1,
  "collector": "scripts/pr-approval/collect.mjs",
  "policySha256": "…",
  "pr":   { "number": 7, "remote": "origin", "headSha": "<40 hex>",
            "source": { "command": "git ls-remote origin refs/pull/7/head", "at": "<ISO>" } },
  "diff": { "baseRef": "origin/main", "baseSha": "…", "headSha": "…",
            "files": [{ "path": "docs/a.md", "status": "M", "additions": 3, "deletions": 1, "binary": false }],
            "source": { "command": "git fetch …; git merge-base …; git diff -z --numstat --no-renames …", "at": "…" } },
  "checks": [{ "id": "biome", "command": "<expanded>", "exitCode": 0, "signal": null,
               "stdout": "…", "stderr": "…", "truncatedBytes": { "stdout": 0, "stderr": 0 },
               "sha": "<HEAD when it ran>", "treeClean": true,
               "startedAt": "…", "finishedAt": "…", "source": "bash -c <command>, run by collect.mjs …" }]
}
```

Output longer than 64 KiB keeps its tail, and `truncatedBytes` says how much was cut.

## What the controller checks

Every condition is evaluated and reported with PASS/FAIL and a reason. The decision is
`approved` only if all of them pass.

| Condition | Fails when |
| --- | --- |
| `evidence.present` | The file is missing, unreadable, or lacks `pr`, `diff` or `checks`. Nothing else is evaluated. |
| `pr.head` | `git ls-remote` fails, or the live head ≠ `pr.headSha`. |
| `diff.sha` | `diff.headSha` ≠ PR head. |
| `diff.base` | `diff.baseSha` ≠ merge-base of the head with `<remote>/<baseBranch>`, which would let a chosen base hide commits. |
| `diff.recomputed` | The controller re-runs `git diff --no-renames` with the recorded base and head, and the evidence's file list (paths, status, counts) differs, or a commit is not available locally. |
| `paths.allowed` | A file (from the **recomputed** diff) is outside `allowedPaths`. |
| `paths.humanReview` | A file matches `humanReview.paths`. |
| `diff.lines` | Lines > `maxDiff.lines`, or any binary file. |
| `diff.files` | Files > `maxDiff.files`, or no added/modified file left (deletion-only). |
| `check:<id>` | Missing or duplicated, `sha` ≠ head, `treeClean` ≠ true, command ≠ expanded template, or exit code ≠ 0. |
| `pr.headRecheck` | Right before recording, `git ls-remote` is read again and the head changed (or can't be read). |

The record `decisions/pr-<n>-<sha>.json` holds all of the above plus `evaluatedAt`, the
policy path with its sha256, and the evidence path with its sha256. If the record cannot
be written, the decision becomes `rejected`.

## Limitations

- **Check results are taken from the evidence.** The controller rebuilds the PR head and
  the diff from git, but it cannot rebuild a check's output and exit code without running
  the check again. For checks it verifies only what the evidence states: the exact command,
  the commit (`sha`) and the clean tree. Those are self-reported by `collect.mjs`. A
  hand-edited `exitCode: 0` is not detectable here, which is why the skill forbids editing
  evidence and why changes to this directory always require human review.
- The checks run in the user's working tree on a detached checkout of the PR head, with
  whatever `node_modules` is installed. A PR whose dependencies differ from the installed
  ones should not be auto-approved anyway (`package.json`/`yarn.lock` force human review).
- "Clean tree" ignores untracked files (`--untracked-files=no`). Otherwise
  `decisions/`, which is not ignored on commits that predate this directory, would make
  every run dirty.
- `diff.base` uses the local `refs/remotes/<remote>/<baseBranch>`, which `collect.mjs init`
  fetches. If the base branch is fetched again between collecting and evaluating and the PR
  is no longer based on it, the condition fails, and the fix is to collect again.
- There is no `gh` dependency. The PR head comes from `refs/pull/<n>/head`, which GitHub
  publishes. Nothing is posted to GitHub.

## Reference runs (`evidence/`)

`evidence/<run>/` holds the `evidence.json` and `decision.json` of a real run against a
real PR of this fork. The SHA in them is the PR head **at the time of the run**. Later
commits, including the one that added these files, move the head, so re-evaluating those
files today correctly fails `pr.head`.

## Tests

```bash
node --test scripts/pr-approval/*.test.mjs
```

The unit tests drive `evaluate()` with a stubbed git. The CLI tests build a bare repo that
serves `refs/pull/7/head` and run `collect.mjs` and `evaluate.mjs` against it, including
moving the PR after collecting, tampering with the file list, a failing check, and SIGINT
during a check (the checkout must be restored).
