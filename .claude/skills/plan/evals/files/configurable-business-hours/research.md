# Configurable Business Hours Research

## Task

Business hours are hard-coded to 08:00–18:00. Let each user set a start and end hour on
their profile, defaulting to today's values, and make the Booker use them.

## Current Behavior

`BUSINESS_HOURS` in `packages/features/bookings/Booker/utils/businessHours.ts` holds
`startHour: 8`, `endHour: 18` and the Mon–Fri weekdays; `isOutsideBusinessHours` and
`formatBusinessHour` read it directly. Nothing about business hours is stored per user.

## Relevant Files

| Path | Role |
|------|------|
| `packages/prisma/schema.prisma` | `User` model — no business-hours fields today; `metadata` is a JSON column |
| `packages/trpc/server/routers/viewer/me/updateProfile.handler.ts` | Profile update mutation |
| `packages/trpc/server/routers/viewer/me/updateProfile.schema.ts` | Its zod input |
| `apps/web/modules/settings/my-account/profile-view.tsx` | Profile settings UI |
| `packages/features/bookings/Booker/utils/businessHours.ts` | The constant and the check |
| `apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx` | Renders the warning |
| `packages/i18n/locales/en/common.json` | Labels for the new fields |

## Surfaces Affected

The Booker warning (all layouts, via `BookEventForm`), the profile settings page. The
Booker runs for the *booker*, not the host — whose hours apply is open (see below).

## Domain Rules

If a root CLAUDE.md exists, its rules apply: IANA timezone names, the user's timezone, no
fixed house timezone. Not present on this branch.

## Prior Art

`specs/copy-booking-summary/` — a recent feature spec with ADRs.

## Open Questions

- [ ] Storage: dedicated `User` columns or a key in `metadata`? — columns are typed and
  queryable but need a migration; metadata needs none but is untyped.
- [ ] Whose hours does the Booker use: the host's or the booker's?
