---
name: plan
description: Second step of the research → plan → implement chain for a task in the cal.diy repo. Reads specs/<slug>/research.md (and the root CLAUDE.md when it exists); writes specs/<slug>/plan.md — the proposed changes file by file, the tests, the exact verification commands, the PR size check — with `Status: awaiting-approval`, plus design.md and decisions.md for features. Then stops and waits for the user to approve by editing that status line; never edits source code and never marks a plan approved. The next step, `implement`, reads specs/<slug>/plan.md and refuses to run until it says `Status: approved`. Use this when research.md exists and the user wants to move on ("planeja", "pode planejar", "segue pro plano", "next step"), or asks to change a plan that already exists.
---

# Plan

Second of three skills chained through files in `specs/<slug>/`:

| Step | Reads | Writes |
|---|---|---|
| `research` | the task description | `research.md` |
| **plan** (this) | `research.md` | `plan.md` (+ `design.md`, `decisions.md` for features) |
| `implement` | `plan.md` with `Status: approved` | code, tests, `implementation.md`, commit, push |

**Plan does not implement anything.** It writes only inside `specs/<slug>/`, and stops
after writing plan.md. The point of this step is that the user sees exactly what will
change, and how it will be checked, while changing it is still free.

## Where the chain stands

Find the spec folder: a slug or path the user gave; else the current branch name with
its `type/` prefix stripped (`fix/negative-duration` → `specs/negative-duration/`);
else list the `specs/*/research.md` files and ask. If there's no research.md, this task
hasn't been researched — run `research` first rather than planning from memory.

If plan.md already exists, you're revising it, not starting over (see *Revising*).

## Language

Talk to the user in the language they write to you in — usually Portuguese.
Everything that lands in the repo is English, plan.md included.

## 1. Read the research

Read `specs/<slug>/research.md` in full, and the root `CLAUDE.md` when it exists
(`test -f CLAUDE.md`) — its domain rules override generic instincts. Don't copy or
recreate CLAUDE.md if it's missing.

**Open questions come first.** Any unticked question in research.md whose answer would
change the plan has to be answered before you propose anything: ask the user, and record
each answer in plan.md under *Answered Questions*. Questions that don't affect this plan
can stay open; say which and why.

## 2. Choose where the code goes

research.md lists every surface the change touches. Pick the layer that covers all of
them — the one place where a change reaches every layout and flag the research found —
and follow the shape of the sibling research.md named. If a surface stays uncovered,
that's a known gap and goes in the plan explicitly, not into silence.

## 3. Size it

The repo's rule (`specs/README.md`) is that **every PR is reviewable in under 10
minutes**: at most 5–7 files excluding tests, at most 500 lines, one focused change. If
the plan is bigger, say so in plan.md and propose a split into PRs — which slice ships
first is the user's call, and plan.md covers only that slice. Don't silently plan a
1200-line PR.

## 4. Features: design.md and decisions.md

If this is a new feature, or a change carrying real architectural decisions, copy the two
templates it needs individually — not the whole `_templates` folder:

```bash
cp specs/_templates/design.md specs/_templates/decisions.md specs/<slug>/
```

Fill `design.md` (what and why: problem, user stories, technical design, edge cases, out
of scope) and record each genuine trade-off as an ADR in `decisions.md`. plan.md then
links to them instead of repeating them. No `{placeholder}` braces may survive.
`specs/cancellation-reason-requirement/` is a filled-in example worth matching.

For a bugfix, a refactor or a copy change, skip both: plan.md is enough, and the
reasoning goes in the commit body later. Five markdown files for a one-file fix is
ceremony nobody will read.

## 5. Decide the tests and verifications

The PR template requires confirming "automated tests are in place", and that checkbox
should be true when it's ticked. Name each test file in the plan — and mind the
extension, because **where a test file goes decides how it runs** (`vitest.workspace.ts`):

- `*.test.ts` anywhere under `packages/**` → `@calcom/lib` project, **node** environment.
- `*.test.tsx` under `packages/features/bookings/**` → `@calcom/features/bookings`, **jsdom**.
- `*.timezone.test.ts` → only runs under `VITEST_MODE=timezone` with an explicit `TZ`.
  Use it when the assertion depends on the machine's zone, not just on a zone argument.

A component test written as `.ts` runs without a DOM and fails in a way that looks like a
bug in the component.

**User-facing strings** go in `packages/i18n/locales/en/common.json` only — other locales
come from the translation pipeline. i18next escapes interpolated values by default, so a
value containing a slash (`America/Sao_Paulo`) reaches the page as `America&#x2F;Sao_Paulo`.
Write the proposed copy into the plan, phrased so it doesn't need to interpolate one.

Both verifications are mandatory; write them as exact commands so `implement` runs them
as-is:

```bash
yarn test <path/to/file.test.ts>     # root script is `TZ=UTC vitest run`
yarn turbo run type-check --filter=@calcom/web   # scope it; bare `yarn type-check` walks the monorepo
```

Pass paths to `yarn test` rather than the full suite — the suite is long and a scoped
run is what makes the step cheap enough to actually do. Plan a broader run only when the
change is broad. Lint is not a verification step: husky runs `lint-staged` on commit.

## 6. Write plan.md

~~~markdown
# {Task Title} Plan

Status: awaiting-approval

Research: [research.md](./research.md)
{Features: Design: [design.md](./design.md) · Decisions: [decisions.md](./decisions.md)}

## Summary

{The one-sentence task from research.md, and the approach in two or three lines.}

## Answered Questions

- {Question from research.md} — {answer, and who gave it}

## Changes

| File | Change |
|------|--------|

## Tests

| Test file | Cases |
|-----------|-------|

## Verifications

```bash
{exact commands}
```

{Manual checks, if any, as steps.}

## Size

{Files (excluding tests) and estimated lines against the 5–7 files / 500 lines rule;
the split and which slice this plan covers, if it's over.}

## Known Gaps

{What this deliberately doesn't cover, and what closing it would take.}
~~~

## 7. Stop for approval

The approval lives in the file, not in the conversation, so it can be checked:

- You write `Status: awaiting-approval` — always, every time you write or revise plan.md.
- **Only the user writes `Status: approved`**, by editing that line themselves.
  `implement` reads it with a script before touching anything and refuses otherwise.
- Never write `approved` yourself, not even when the user says "aprovado" or "pode
  seguir" in the chat. Tell them instead: edit the line in `specs/<slug>/plan.md`, then
  run `implement`. An approval typed in chat is exactly what this mechanism exists to
  replace.

End with a short message: where plan.md is, the approach in a line or two, the size
check, the known gaps, and the line to edit.

## Revising

If the user asks for changes — before or after approving — edit plan.md and set the
status back to `Status: awaiting-approval`. A plan approved and then changed is a
different plan; the old approval doesn't carry over. Say that you reset it.
