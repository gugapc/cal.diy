---
name: implement
description: Last step of the research → plan → implement chain for a task in the cal.diy repo. Reads specs/<slug>/plan.md (plus research.md, design.md, decisions.md and the root CLAUDE.md when they exist) and refuses to run — touching no file — unless scripts/check-plan-approved.sh confirms the plan says `Status: approved`, a line only the user writes. Then writes the code and tests the plan lists, keeps specs/<slug>/implementation.md current for features, runs the plan's verifications (scoped yarn test + type-check), stops once to show diff, commit message and PR body, and after approval commits, pushes and hands over the GitHub compare link. Use this when the user says the plan is approved or asks to implement it ("implementa", "aprovei o plano", "pode seguir"), and when they pick work back up mid-flight ("continua a feature Z").
---

# Implement

Last of three skills chained through files in `specs/<slug>/`:

| Step | Reads | Writes |
|---|---|---|
| `research` | the task description | `research.md` |
| `plan` | `research.md` | `plan.md` (+ `design.md`, `decisions.md` for features) |
| **implement** (this) | `plan.md` with `Status: approved` | code, tests, `implementation.md`, commit, push |

## 0. The approval check comes first

Find the spec folder: a slug or path the user gave; else the current branch name with its
`type/` prefix stripped (`fix/negative-duration` → `specs/negative-duration/`); else list
the `specs/*/plan.md` files and ask.

Then, **before reading further, creating a file, editing one or switching branch**:

```bash
.claude/skills/implement/scripts/check-plan-approved.sh specs/<slug>
```

If it exits non-zero, stop. Don't touch anything — not source, not tests, not
implementation.md, not plan.md. Tell the user what the script printed, and that the
approval is the line `Status: approved` in `specs/<slug>/plan.md`, written by them.

This holds even when the user says "aprovado", "pode implementar" or "já aprovei" in the
chat. Don't edit the status line on their behalf and don't proceed on the conversational
"ok": the file is the approval, and its being checkable is the whole point. If there's
no plan.md at all, the task needs `research` and `plan` first — say so.

## Pace: run through to the gate

With the plan approved, run from implementation through verification **without
stopping**. Stop exactly once more: after the code works and the checks pass, present the
diff, the commit message and the PR body together, and wait. Approval there covers the
commit *and* the push that follows — the push is public, which is why this second gate
exists even though the plan was approved.

Stay inside the plan. If implementing shows the plan is wrong in a way that changes the
work — another layer, more files, a different approach — stop and send it back to `plan`,
which resets the status to `awaiting-approval`. Never edit plan.md from here. Small
deviations (a helper renamed, an extra test case) are fine; record them in
implementation.md or in the commit body.

## Language

Talk to the user in the language they write to you in — usually Portuguese.
Everything that lands in the repo is English: code, comments, commit messages, PR body,
spec docs.

## 1. Read what was decided

Read `plan.md`, `research.md`, and `design.md` / `decisions.md` when they exist. Read the
root `CLAUDE.md` when it exists (`test -f CLAUDE.md`) — the maintainer's domain rules
override generic instincts. Don't copy or recreate it if it's missing.

Confirm you're on the task's branch (research created it). Never commit on `main`; if
you're somehow on it, `git checkout -b <type>/<slug>` carries the working tree over.

## 2. Implement

For a feature, copy the progress templates individually — not the whole `_templates`
folder:

```bash
cp specs/_templates/implementation.md specs/_templates/future-work.md specs/<slug>/
```

Keep `implementation.md` current as you go (it's what a future session reads to resume),
and park deferred ideas in `future-work.md`. Bugfixes, refactors and copy changes skip
both.

While writing code:

- Write the changes and tests plan.md lists, at the paths it names. A test file's
  extension decides its vitest environment — the `plan` skill has the rules; don't change
  an extension without checking them.
- Match the file's existing idiom — its naming, its comment density, its error handling.
- Comments explain *why*, never *what*. A comment that restates the line is noise; a
  comment recording the trap you just avoided saves the next person an hour.
- User-facing strings go in `packages/i18n/locales/en/common.json` only, with the copy
  the plan proposed.

## 3. Verify — run the plan's commands

Run every command under *Verifications* in plan.md, as written. Both `yarn test` (scoped to
paths) and the type-check are mandatory, even if the plan somehow omits one.

Failures are part of the work, not something to present for approval. Fix them, rerun,
then move to the gate. If something is genuinely unfixable within the plan's scope, that
belongs in the commit body as a known gap — and in what you tell the user.

Lint is not a separate step: husky runs `lint-staged` on commit.

## 4. The gate

One message, then stop and wait. It contains three things:

1. **What changed** — `git diff --stat` plus two or three lines of prose.
2. **The proposed commit message**, in full.
3. **The PR body**, in full.

Show all three together because the push happens immediately after the user approves.
They need to see the public text while it's still private.

If they ask for changes, revise and show it again. If they say "commit but don't push",
honour that and stop after the commit.

### Commit message shape

```
type(scope): imperative subject, ~72 chars

Why this change is needed — the situation that makes it necessary. Not a
restatement of the diff; the diff is already in the commit.

What the change does, including which cases it covers.

Any non-obvious decision and the reason for it — especially a trap you hit
and worked around, so nobody re-introduces it.

Known gap: what this deliberately doesn't cover, and what closing it would take.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

The bar to match, compressed from a real commit on this repo:

> `feat(booker): warn when a booking falls outside business hours`
>
> *Why:* slots offered on the booking page are always inside the host's availability, so an
> odd-hour slot is almost always a timezone gap the booker hasn't noticed.
> *What:* the check runs against the booker's own wall clock and covers four cases — non-business
> day, start before opening, start after closing, and a booking running past closing.
> *Decision:* the warning renders inside `BookEventForm` rather than the details panel, because
> three layouts open the form in a Dialog and the panel is hidden when `hideEventTypeDetails` is set.
> *Trap:* wall-clock minutes are compared directly, because dayjs setters on a `.tz()` instance
> resolve against the machine timezone.
> *Known gap:* event types that skip the confirm step never render the form, so they don't get
> the warning.

The plan's *Known Gaps* section is the starting point for the commit's.

### PR body

Follow `.github/PULL_REQUEST_TEMPLATE.md`. Fill in "What does this PR do?", "How should
this be tested?" (env vars needed, minimal data, happy path), and keep the **Mandatory
Tasks** block — tick only what is actually true. Link `specs/<slug>/plan.md` so the
reviewer can see what was approved.

Two details that are easy to get backwards:

- The bullets under **Checklist** are *negative* statements ("I haven't read the
  contributing guide", "My PR is too large"). Delete the ones that don't apply, which is
  normally all of them. Leaving them in claims the opposite of what you mean.
- **Visual Demo** is strongly recommended and this flow doesn't produce screenshots.
  Leave the section with a note that the user can attach one, and tell them so at the end
  rather than quietly shipping an empty section.

## 5. Commit, push, hand over the link

After approval:

```bash
git add <only the files belonging to this change> specs/<slug>/
git commit -F <message file>
```

The spec folder goes in the commit — research.md and plan.md included, for bugfixes too.

Husky's pre-commit hook runs `yarn app-store:build` and then `git add packages/app-store/*.generated.*`.
It's slow, and it can sweep generated files into your commit. Run `git show --stat` after
committing; if generated files you never touched got in, drop them and amend, and say so
rather than leaving the user to find them in review.

```bash
git push -u origin <branch>
.claude/skills/implement/scripts/compare-url.sh
```

`compare-url.sh` prints the GitHub compare URL for the current branch, resolving the SSH
remote — including a custom host alias like `git@github-personal:` — to an `https://github.com`
address. Give the user that URL.

Save the PR body to `.git/pr-body.md` as well. It sits outside version control, so it can
never be committed by accident, and it survives the terminal scrollback.

## 6. Close out

Tell the user, briefly:

- what's on the branch and what the checks reported
- the compare URL, and that the PR body is in `.git/pr-body.md`
- anything left open — known gaps, a Visual Demo to attach, checkboxes only they can
  honestly tick (self-review, developer docs)

Report what actually happened. If a check was skipped or a test still fails, say it
plainly with the output; a PR opened on a false "all green" costs far more than the
sentence admitting it.

## Resuming work

If the user picks something back up ("continua a feature X"):

1. Run the approval check (step 0) — resuming doesn't skip it.
2. `git branch --show-current` and `git status` — find out where the work actually is.
3. If `specs/<slug>/implementation.md` exists, read it: Status, Completed, Next Steps.
4. Say in one line where things stand, then continue from the phase that fits — don't
   restart from the top.
