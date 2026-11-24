---
name: pr-autoapproval
description: Decides whether a pull request of this fork can be auto-approved, by collecting evidence and handing it to the code controller in scripts/pr-approval/. Identifies the PR and its head commit, gathers the changed files and diff size from git, runs every check required by scripts/pr-approval/policy.json on that exact commit (keeping command, output and exit code), records where each piece of evidence came from, then runs scripts/pr-approval/evaluate.mjs and presents its verdict verbatim. The skill never judges; the controller decides. Use this when the user asks whether a PR can be auto-approved or merged without review ("autoaprova a PR 7", "a PR 12 pode ser aprovada?", "roda a política de aprovação", "check PR approval"), or asks to run the PR approval policy or controller.
---

# PR auto-approval

The **decision belongs to `scripts/pr-approval/evaluate.mjs`**. This skill identifies the
PR, collects evidence with `scripts/pr-approval/collect.mjs`, calls the controller and
shows what it said. It does not read the policy to form an opinion, predict the outcome,
or soften or override the result.

Talk to the user in their language (usually Portuguese).

## Hard rules

- Never write or edit an evidence file by hand. Every field comes from `collect.mjs`.
  Evidence assembled by the agent is exactly what the controller must not depend on.
- Run **every** required check, even after one fails, and never with a command other than
  the one the policy gives. The collector expands the policy's command itself.
- Never re-run a check to "make it pass", change the policy, or switch to another PR or
  commit mid-run. If something changes (new push, dirty tree), start over from step 1.
- Never say a PR is approved unless the controller printed `Decision: APPROVED` and exited 0.
  Never approve or merge on GitHub; the recorded decision is the output.
- The user's checkout must end where it started. Step 3 enforces that; report it.

## 1. Identify the PR and its commit

- The PR number comes from the user. If they didn't give one, list the open PR heads and
  match the current branch's commit:

  ```bash
  git ls-remote origin 'refs/pull/*/head'
  git rev-parse HEAD
  ```

  If there is no exact match, ask for the number. Don't guess.
- Check that the tree is clean (`git status --porcelain --untracked-files=no` prints
  nothing). If it isn't, stop and tell the user. Don't stash or commit their work.

## 2. Collect the PR and diff evidence

```bash
node scripts/pr-approval/collect.mjs init --pr <n>
```

This reads the head with `git ls-remote origin refs/pull/<n>/head`, fetches it and
`origin/main`, computes the merge-base and the diff with `--no-renames`, and writes
`scripts/pr-approval/decisions/pr-<n>-<sha>.evidence.json`, printing the path. Each section
records its `source` (command and time). Keep the printed path. If it fails, report the
error and stop.

## 3. Run the required checks on the PR head

`run-checks` checks out the PR head detached, runs every check in
`policy.json#requiredChecks` and records command, stdout, stderr, exit code, commit and
whether the tree was clean, writing the evidence after each check. It switches back in a
`finally` block and on SIGINT/SIGTERM. As a second guarantee, run it in **one** Bash call
wrapped in a `trap`, so the restore happens even if node itself dies:

```bash
EVIDENCE=<path from step 2>
ORIG_BRANCH=$(git branch --show-current); ORIG_SHA=$(git rev-parse HEAD)
restore() {
  if [ -n "$ORIG_BRANCH" ]; then git switch --quiet "$ORIG_BRANCH"
  else git switch --quiet --detach "$ORIG_SHA"; fi
}
trap restore EXIT INT TERM
echo "before: ${ORIG_BRANCH:-detached at $ORIG_SHA}"
node scripts/pr-approval/collect.mjs run-checks --evidence "$EVIDENCE"
echo "collect exit: $?"
restore; trap - EXIT INT TERM
echo "after: $(git branch --show-current || true) $(git rev-parse HEAD)"
```

The checks can take a few minutes (vitest loads the whole workspace), so give the Bash
call a generous timeout (for example 600000 ms). A check that exits non-zero is
**evidence**, not an error: don't stop, don't fix anything, go on to step 4.

Then tell the user which branch (or detached SHA) they were on and which one they're on
now. Take both from the `before:`/`after:` lines and from collect's
`started:`/`restored:` lines. If they differ, or collect printed `restored: FAILED`, say so
prominently and stop before step 4.

## 4. Run the controller

```bash
node scripts/pr-approval/evaluate.mjs --evidence "$EVIDENCE"
echo "evaluate exit: $?"
```

Exit code 0 means approved, 1 rejected, 2 usage or policy error. The controller re-reads
the PR head, recomputes the diff from git, applies the policy and writes
`scripts/pr-approval/decisions/pr-<n>-<sha>.json`.

## 5. Present the result

Show the controller's output **verbatim** in a code block: PR, commit, decision, every
condition with PASS/FAIL and its reason, and the policy, evidence and record paths. Then
add only:

- the branch the user was on and the branch they're on now (step 3);
- the evidence and decision file paths;
- if rejected, the failed conditions as the controller worded them. You may point to the
  `stdout`/`stderr` of a failed check in the evidence file, but don't propose that the PR
  is "basically fine".

Don't add your own approval or rejection, a confidence level, or "I'd approve anyway".
If the controller said REJECTED, the answer is rejected. Human review is the next step,
which the user decides on.
