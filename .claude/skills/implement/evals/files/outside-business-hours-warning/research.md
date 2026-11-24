# Outside Business Hours Warning Research

## Task

Wrap the uncommitted business-hours warning in the working tree into a commit and PR:
the Booker warns the booker when the chosen slot falls outside Mon–Fri 08:00–18:00 in
their own timezone.

## Current Behavior

Uncommitted on the branch:

- `packages/features/bookings/Booker/utils/businessHours.ts` — new: `BUSINESS_HOURS`,
  `isOutsideBusinessHours`, `formatBusinessHour`.
- `packages/features/bookings/Booker/utils/businessHours.test.ts` — new: unit tests.
- `apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx` — renders
  the warning above the form.
- `packages/i18n/locales/en/common.json` — two new keys for the warning copy.

## Relevant Files

As above.

## Surfaces Affected

`BookEventForm` renders in every layout, including the Dialog used by `week_view`,
`column_view` and mobile. Event types that skip the confirm step never render it.

## Domain Rules

No root CLAUDE.md on this branch.

## Prior Art

None for warnings in the Booker.

## Open Questions

None.
