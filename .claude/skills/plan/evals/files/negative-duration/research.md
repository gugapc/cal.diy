# Negative Duration in Business Hours Check Research

## Task

`isOutsideBusinessHours` lets a slot with a negative `durationInMinutes` pass as inside
business hours; bookers get no warning for it. Make negative durations handled explicitly.

## Current Behavior

`packages/features/bookings/Booker/utils/businessHours.ts:72` — `if (!durationInMinutes) return false;`
lets a negative number through (it's truthy), then `start.add(-30, "minute")` ends *before*
the start, on the same day and before closing, so the function returns `false`. A Tuesday
17:00 slot with `-30` is reported as inside — the same result as a duration of zero.

## Relevant Files

| Path | Role |
|------|------|
| `packages/features/bookings/Booker/utils/businessHours.ts` | `isOutsideBusinessHours` |
| `packages/features/bookings/Booker/utils/businessHours.test.ts` | Its unit tests (node env) |

## Surfaces Affected

Only `BookEventForm.tsx` calls `isOutsideBusinessHours`; it passes the event length, so the
change is local to the helper.

## Domain Rules

No root CLAUDE.md on this branch.

## Prior Art

The helper's docstring: "A slot we can't read is never reported as outside: staying silent
beats warning wrongly."

## Open Questions

- [x] Should a negative duration warn (`true`) or stay silent (`false`)? — the docstring
  favours silence, the user called "passes as inside" the bug. **Answer (user): warn — a
  negative duration can't be a real booking.**
