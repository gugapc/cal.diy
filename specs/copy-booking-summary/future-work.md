# Copy Booking Summary Future Work

Ideas and enhancements deferred from initial implementation.

## Enhancements

- Same button in the booking details sheet on `/bookings` (`apps/web/modules/bookings/components/BookingDetailsSheet.tsx`); `getBookingSummary` already takes everything it needs as arguments
- Recurring series: copy every listed occurrence, one line each, instead of hiding the button
- Embeds: add `clipboard-write` to the iframe's `allow` in `packages/embeds/embed-core/src/embed.ts`, then drop the `!isEmbed` condition

## Technical Debt

## Nice to Have

- Optional location line (meeting link or address)
- Per-language layout of the summary (see ADR-001 for what that requires)
