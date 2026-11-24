---
name: research
description: First step of the research → plan → implement chain for a task in the cal.diy repo. Reads only the user's task description (plus the root CLAUDE.md when it exists); writes specs/<slug>/research.md and nothing else — current behaviour, the files and every surface involved, domain rules, open questions. Creates the task branch but never edits source code. The next step, `plan`, reads specs/<slug>/research.md. Use this whenever the user describes something they want built, changed or fixed in this repo ("quero adicionar…", "tem um bug em…", "implement X", "vamos fazer Y"), even when they never mention specs, research or PRs — and also when they ask to wrap changes already in the working tree into a commit and PR, since those still need a researched, approved plan.
---

# Research

This repo is a fork of cal.com: a large Yarn/Turbo monorepo where the same concept
usually exists in three or four layers at once. Most of the cost of a change here is
not writing it — it's landing it in the right layer, with the reasoning attached, in a
shape a reviewer can approve in ten minutes.

This skill is the first of three, chained through files in `specs/<slug>/`:

| Step | Reads | Writes |
|---|---|---|
| **research** (this) | the task description | `research.md` |
| `plan` | `research.md` | `plan.md` (+ `design.md`, `decisions.md` for features) |
| `implement` | `plan.md` with `Status: approved` | code, tests, `implementation.md`, commit, push |

**Research does not implement anything.** No edits to source, tests, locales or config,
and no `plan.md`. The only file it writes is `specs/<slug>/research.md`. If you catch
yourself about to fix the bug you just found, write it down in research.md instead — the
fix belongs to a plan the user hasn't approved yet.

## Where the chain stands

Before starting, check whether this task is already in flight (`git branch --show-current`,
`git status`, `ls specs/`). If `specs/<slug>/research.md` already exists, update it rather
than starting over. If `plan.md` exists too, the task is past research: say so and hand
over to `plan` or `implement`.

## Language

Talk to the user in the language they write to you in — usually Portuguese.
Everything that lands in the repo is English, research.md included. The repo's history
and docs are English and a Portuguese file would be the odd one out.

## 1. Read the task

Restate in one or two sentences what will change and for whom. That sentence opens
research.md, and the commit body has to justify it later, so getting it wrong here is
expensive.

If two readings of the task lead to materially different work, ask before grounding,
not after — and record the question and the answer in research.md.

## 2. Name the slug and branch

Pick a short kebab-case slug for the task. It names both the spec folder and the branch:

```bash
git checkout -b <type>/<slug>    # off main
mkdir -p specs/<slug>
```

The prefix matches the eventual commit type: `feat/`, `fix/`, `chore/`, `refactor/`,
`docs/`. Branch **before the first write** — research.md is a write — and never work on
`main`. If edits already exist in the working tree, `git checkout -b` carries them onto
the new branch; no need to stash.

Every task gets a folder, bugfixes included: the chain hands work over through files, and
research.md and plan.md are committed with the PR. Create only research.md here. Don't
copy `specs/_templates` wholesale — later steps copy the individual templates they need.

## 3. Ground in the codebase

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
you're changing and list them all in research.md; `plan` chooses where the code goes from
that list.

Things to read every time:

- **`CLAUDE.md` at the repo root, when it exists.** Check with `test -f CLAUDE.md`. When it
  is there it holds the maintainer's domain rules — timezone handling, business hours,
  DST, display conventions — which override generic instincts and are not negotiable
  defaults; quote the ones that apply into research.md so the next steps carry them.
  When it isn't, say so in one line and move on. Don't copy or recreate it from another
  branch.
- **A sibling that already does something similar.** Grep for it; `plan` will follow its
  shape. Consistency with the neighbours beats a preferred structure.
- **`specs/*/`** for features already built, if one is related — the design and ADRs
  explain why things are the way they are.

### When the task is "wrap what's in the working tree"

Read `git status` and `git diff` (plus untracked files) and describe the existing
changes in research.md as current behaviour of the branch: which files, what each change
does, what looks incomplete. Leave those files exactly as they are.

## 4. Write research.md

```markdown
# {Task Title} Research

## Task

{One or two sentences: what will change and for whom.}

## Current Behavior

{How it works today, with `path:line` references. For working-tree tasks, also what the
uncommitted changes do.}

## Relevant Files

| Path | Role |
|------|------|

## Surfaces Affected

{Every place that renders or consumes the thing being changed, including layouts and
flags that hide it.}

## Domain Rules

{Rules quoted from the root CLAUDE.md that apply — or "No root CLAUDE.md on this branch."}

## Prior Art

{Siblings to follow and related specs/*/ folders.}

## Open Questions

- [ ] {Question} — {why it matters: the readings and how each changes the work}
```

Keep it factual: what is, not what should be. Proposals belong in plan.md. A question
you can answer by reading the code isn't open — answer it.

## 5. Hand over

Stop here. Tell the user, briefly: the slug and branch, the two or three findings that
matter most, and the open questions. If they answer now, record the answers in
research.md (tick the box, add the answer). Then point to the next step: `plan` reads
`specs/<slug>/research.md`.
