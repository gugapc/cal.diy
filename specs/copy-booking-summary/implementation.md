# Copy Booking Summary Implementation

## Status: complete

## Completed

1. `getBookingSummary` in `packages/features/bookings/lib/getBookingSummary.ts`
   - title, full date, time range and IANA timezone, one per line
   - non-IANA timezones (invalid names, UTC offsets) fall back to UTC
2. Unit tests in `getBookingSummary.test.ts`: 12h/24h, locale, day boundary, DST transition, UTC fallback, unescaped title
3. `bookings-single-view.tsx`
   - extracted `bookingTitle` so the "What" row and the summary can't drift apart
   - "Copy summary" button under the "When" row, via `useCopy`, with success/failure toasts
   - hidden for cancelled bookings, recurring series lists and embeds
4. Translation keys `copy_booking_summary` and `booking_summary_copied` in the English locale

## In Progress

## Blocked

## Next Steps

- Attach a screenshot of the button to the PR (Visual Demo)
- Follow-ups are in future-work.md

## Session Notes

### 2026-09-25

- Node 24's `Intl` accepts `-03:00` as a `timeZone`; `isSupportedTimeZone` alone let it through (ADR-003)
- No automated test renders `bookings-single-view.tsx`; the button wiring is covered by type-check only
