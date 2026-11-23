# CLAUDE.md — Copy Booking Summary

## Project Context

A "Copy summary" button on the booking page (`/booking/[uid]`) that puts the booking's title, date, time range and timezone on the clipboard as plain text, in the timezone of whoever is viewing the page.

## Before Starting Work

1. Read specs/copy-booking-summary/design.md
2. Check specs/copy-booking-summary/implementation.md for current progress
3. Look at `packages/features/bookings/lib/getCalendarLinks.ts`, the sibling that also turns a booking into something shareable

## Code Patterns

- Text building lives in `packages/features/bookings/lib/getBookingSummary.ts` — pure, no React, unit-tested
- Clipboard access goes through `useCopy` (`packages/lib/hooks/useCopy.ts`)
- The summary must show the same values the page shows: same `tz`, same `is24h`, same locale

## Don't

- Don't build the summary through a translation key with interpolation — i18next escapes `/`
- Don't print a localized timezone label or a fixed offset in the summary — IANA name only
- Don't add features not in design.md
