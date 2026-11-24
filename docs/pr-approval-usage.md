# Getting a pull request auto-approved

Some pull requests in this fork can be approved without a human reviewer. The decision is
made by code, not by a person or an agent: `scripts/pr-approval/evaluate.mjs` applies
`scripts/pr-approval/policy.json` to evidence collected from git and records the result.
This page is for contributors who want to know whether their change qualifies and how to
run the check. The controller itself is documented in `scripts/pr-approval/README.md`.

## Does my PR qualify?

All of these must hold:

- **Only allowed paths.** Every changed file matches `**/*.md`, `docs/**`, `specs/**` or
  `scripts/agent/**`.
- **No path that always needs a human.** Nothing under `scripts/pr-approval/`, `.claude/`,
  `.github/` or `packages/prisma/`, no `CLAUDE.md`, `package.json`, `yarn.lock` or `.env*`
  file, even if it also matches an allowed path.
- **Small.** At most 300 changed lines (additions + deletions) and 10 files, with no
  binary file and at least one added or modified file.
- **Checks pass on the PR head.** `biome check` and `vitest related` on the changed files
  exit 0, on a clean tree, at the exact commit the PR points to.

In practice: documentation and specs fixes qualify; product code, agent instructions and
the policy itself go to a reviewer.

## Running it

From a clean checkout, with the PR number:

```bash
node scripts/pr-approval/collect.mjs init --pr <n>          # prints the evidence path
node scripts/pr-approval/collect.mjs run-checks --evidence <path>
node scripts/pr-approval/evaluate.mjs --evidence <path>
```

`run-checks` checks out the PR head detached and switches back when it finishes. The last
command prints every condition with PASS/FAIL and exits 0 when approved, 1 when rejected.
In Claude Code, `/pr-autoapproval` runs the same three steps.

## If it is rejected

A rejection is not a verdict on the change, only that it needs a human. Read the FAIL
lines: split an oversized PR, move unrelated files out, or fix the failing check. If the
PR head moves (a new push), collect again; evidence is tied to one commit.
