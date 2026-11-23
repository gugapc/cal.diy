# Outside Business Hours Warning Plan

Status: approved

Research: [research.md](./research.md)

## Summary

Ship the warning already in the working tree as-is, after running the checks.

## Answered Questions

None.

## Changes

| File | Change |
|------|--------|
| `businessHours.ts`, `BookEventForm.tsx`, `en/common.json` | Already written — no further edits |

## Tests

| Test file | Cases |
|-----------|-------|
| `packages/features/bookings/Booker/utils/businessHours.test.ts` | Already written |

## Verifications

```bash
yarn test packages/features/bookings/Booker/utils/businessHours.test.ts
yarn turbo run type-check --filter=@calcom/web
```

## Size

3 files + 1 test, ~260 lines.

## Known Gaps

Event types that skip the confirm step never render the form, so they don't get the warning.
