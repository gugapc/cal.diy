---
name: task-to-pr
description: Takes a task in the cal.diy repo from a plain-language description all the way to a pushed branch and a ready-to-open PR — grounding in the codebase, a spec folder for features, implementation with tests, yarn test + yarn type-check, a single approval gate on the commit, then push and the GitHub compare link. Use this whenever the user describes something they want built, changed or fixed in this repo ("quero adicionar…", "tem um bug em…", "implement X", "vamos fazer Y"), even when they never mention specs, commits or PRs — and also when they pick work back up mid-flight ("continua a feature Z") or ask to wrap already-written changes into a commit and PR.
---

# Task to PR

This repo is a fork of cal.com: a large Yarn/Turbo monorepo where the same concept
usually exists in three or four layers at once. Most of the cost of a change here is
not writing it — it's landing it in the right layer, with the reasoning attached, in a
shape a reviewer can approve in ten minutes. This skill is that path.

## Pace: one gate, right before the commit

Run from task description through implementation and verification **without stopping**.
Stop exactly once: after the code works and the checks pass, present the diff, the commit
message and the PR body together, and wait for approval. Approval covers the commit *and*
the push that follows.

State the plan in a few lines before you start implementing so the user can interrupt if
you read the task wrong — then keep going. Don't ask them to confirm it. They chose a
single checkpoint; extra check-ins are friction, not care.

The exception is genuine ambiguity: if two readings of the task lead to materially
different work, ask before grounding, not after.

## Language

Talk to the user in the language they write to you in — usually Portuguese.
Everything that lands in the repo is English: code, comments, commit messages, PR body,
spec docs. The repo's history and docs are English and a Portuguese commit would be the
odd one out.

## 1. Read the task

Restate in one or two sentences what will change and for whom. That's the sentence the
commit body has to justify later, so getting it wrong here is expensive.

Then size it. The repo's rule (`specs/README.md`) is that **every PR is reviewable in
under 10 minutes**: at most 5–7 files excluding tests, at most 500 lines, one focused
change. If the task is bigger, say so and propose a split — which slice ships first is
the user's call, but don't silently ship a 1200-line PR.

## 2. Ground in the codebase before deciding anything

The layer a change belongs in is rarely obvious from the task description:

| Path | What lives there |
|---|---|
| `apps/web/modules/**` | Route-level views and components of the web app |
| `packages/features/**` | Shared feature logic and UI (Booker, bookings, event-types…) |
| `packages/lib/**` | Pure helpers, no React |
| `packages/ui/**` | Design system components |
| `packages/prisma/**` | Schema and migrations |
| `packages/trpc/**` | API routers |
| `packages/i18n/locales/en/common.json` | The only locale file edited by hand |
| `apps/api/v2`, `packages/platform/**` | Platform/atoms surface — changes there do **not** affect the web app, and vice-versa |

Picking the wrong layer produces a change that works in the case you tested and silently
does nothing everywhere else. A real example from this repo: the Booker renders the
booking form inside a Dialog in `week_view`, `column_view` and on mobile, and hides the
event-details panel entirely when `hideEventTypeDetails` is set — so a warning placed in
the details panel is invisible in most layouts. Find every surface that renders the thing
you're changing *before* you choose where the code goes.

Three things to read every time:

- **`CLAUDE.md` at the repo root.** It holds the maintainer's domain rules — timezone
  handling, business hours, DST, display conventions. These override generic instincts
  and are not negotiable defaults.
- **A sibling that already does something similar.** Grep for it and follow its shape.
  Consistency with the neighbours beats your preferred structure.
- **`specs/*/`** for features already built, if one is related — the design and ADRs
  explain why things are the way they are.

## 3. Spec folder — features only

If this is a new feature, or a change carrying real architectural decisions:

```bash
cp -r specs/_templates specs/{feature-name}
```

Fill `design.md` before writing code, keep `implementation.md` current as you go (it's
what a future session reads to resume), record genuine trade-offs as ADRs in
`decisions.md`, and park deferred ideas in `future-work.md`. `specs/cancellation-reason-requirement/`
is a filled-in example worth matching.

For a bugfix, a refactor or a copy change, skip the folder. The reasoning goes in the
commit body instead. Five markdown files for a one-file fix is ceremony that nobody
will read.

## 4. Branch, then implement

Branch **before the first edit**, off `main`. Never commit on `main`.

```bash
git checkout -b feat/short-kebab-summary
```

The prefix matches the commit type: `feat/`, `fix/`, `chore/`, `refactor/`, `docs/`.
If edits already exist in the working tree, `git checkout -b` carries them onto the new
branch — no need to stash.

While writing code:

- Match the file's existing idiom — its naming, its comment density, its error handling.
- Comments explain *why*, never *what*. A comment that restates the line is noise; a
  comment recording the trap you just avoided saves the next person an hour.
- Write tests. The PR template requires confirming "automated tests are in place", and
  that checkbox should be true when you tick it.

**Where a test file goes decides how it runs** (`vitest.workspace.ts`):

- `*.test.ts` anywhere under `packages/**` → `@calcom/lib` project, **node** environment.
- `*.test.tsx` under `packages/features/bookings/**` → `@calcom/features/bookings`, **jsdom**.
- `*.timezone.test.ts` → only runs under `VITEST_MODE=timezone` with an explicit `TZ`.
  Use it when the assertion depends on the machine's zone, not just on a zone argument.

A component test written as `.ts` runs without a DOM and fails in a way that looks like a
bug in the component. Check the extension before you debug.

**User-facing strings** go in `packages/i18n/locales/en/common.json` only — other locales
come from the translation pipeline. i18next escapes interpolated values by default, so a
value containing a slash (`America/Sao_Paulo`) reaches the page as `America&#x2F;Sao_Paulo`.
Phrase the copy so it doesn't need to interpolate one.

## 5. Verify — both are mandatory

```bash
yarn test <path/to/file.test.ts>     # root script is `TZ=UTC vitest run`
yarn turbo run type-check --filter=@calcom/web   # scope it; bare `yarn type-check` walks the monorepo
```

Pass paths to `yarn test` rather than running the full suite — the suite is long and a
scoped run is what makes this step cheap enough to actually do. Run broader only when
the change is broad.

Failures are part of the work, not something to present for approval. Fix them, rerun,
then move to the gate. If something is genuinely unfixable within the task's scope, that
belongs in the commit body as a known gap — and in what you tell the user.

Lint is not a separate step: husky runs `lint-staged` on commit.

## 6. The gate

One message, then stop and wait. It contains three things:

1. **What changed** — `git diff --stat` plus two or three lines of prose.
2. **The proposed commit message**, in full.
3. **The PR body**, in full.

Show all three together because this is the only checkpoint and the push happens
immediately after the user approves. They need to see the public text while it's still
private.

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

### PR body

Follow `.github/PULL_REQUEST_TEMPLATE.md`. Fill in "What does this PR do?", "How should
this be tested?" (env vars needed, minimal data, happy path), and keep the **Mandatory
Tasks** block — tick only what is actually true.

Two details that are easy to get backwards:

- The bullets under **Checklist** are *negative* statements ("I haven't read the
  contributing guide", "My PR is too large"). Delete the ones that don't apply, which is
  normally all of them. Leaving them in claims the opposite of what you mean.
- **Visual Demo** is strongly recommended and this flow doesn't produce screenshots.
  Leave the section with a note that the user can attach one, and tell them so at the end
  rather than quietly shipping an empty section.

## 7. Commit, push, hand over the link

After approval:

```bash
git add <only the files belonging to this change>
git commit -F <message file>
```

Husky's pre-commit hook runs `yarn app-store:build` and then `git add packages/app-store/*.generated.*`.
It's slow, and it can sweep generated files into your commit. Run `git show --stat` after
committing; if generated files you never touched got in, drop them and amend, and say so
rather than leaving the user to find them in review.

```bash
git push -u origin <branch>
.claude/skills/task-to-pr/scripts/compare-url.sh
```

`compare-url.sh` prints the GitHub compare URL for the current branch, resolving the SSH
remote — including a custom host alias like `git@github-personal:` — to an `https://github.com`
address. Give the user that URL.

Save the PR body to `.git/pr-body.md` as well. It sits outside version control, so it can
never be committed by accident, and it survives the terminal scrollback.

## 8. Close out

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

1. `git branch --show-current` and `git status` — find out where the work actually is.
2. If `specs/{feature}/implementation.md` exists, read it: Status, Completed, Next Steps.
3. Say in one line where things stand, then continue from the phase that fits — don't
   restart the flow from the top.
