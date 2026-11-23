# Negative Duration in Business Hours Check Plan

Status: awaiting-approval

Research: [research.md](./research.md)

## Summary

Report a slot with a negative `durationInMinutes` as outside business hours, with an
explicit guard before the end-time computation.

## Answered Questions

- Warn or stay silent on negative duration? — warn (user, in research).

## Changes

| File | Change |
|------|--------|
| `packages/features/bookings/Booker/utils/businessHours.ts` | `if (durationInMinutes < 0) return true;` before the end check; docstring notes the exception |

## Tests

| Test file | Cases |
|-----------|-------|
| `packages/features/bookings/Booker/utils/businessHours.test.ts` | Tuesday 17:00 with `-30` → `true` |

## Verifications

```bash
yarn test packages/features/bookings/Booker/utils/businessHours.test.ts
yarn turbo run type-check --filter=@calcom/web
```

## Size

1 file + 1 test, ~10 lines.

## Known Gaps

None.
