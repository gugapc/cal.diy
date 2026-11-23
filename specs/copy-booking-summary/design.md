# Copy Booking Summary Design

## Overview

Add a "Copy summary" button to the booking page (`/booking/[uid]`). One click puts the booking's title, date, time range and timezone on the clipboard as plain text, ready to paste into a chat or an email.

## Problem Statement

After booking, people often need to tell someone else when the meeting is — a colleague, an assistant, a group chat. Today they have to retype or hand-copy the title, date and time from the page, and the timezone is the part that gets lost, which turns a correct booking into a missed meeting.

## User Stories

- As an attendee, I want to copy my booking's details in one click so that I can share them without retyping
- As a host looking at a booking page, I want the copied text to carry the timezone so that whoever reads it knows exactly when the meeting is

## Technical Design

### Database Changes

None.

### API Changes

None. Everything the summary needs is already in the page props.

### UI Changes

**Summary text**

Location: `packages/features/bookings/lib/getBookingSummary.ts`

A pure function that returns three lines:

```
30 Min Meeting between Alice and Bob
Friday, September 25, 2026
10:00 AM - 10:30 AM (America/Sao_Paulo)
```

- Title as the page shows it (`bookingTitle`: the booking's own title for round-robin, the event name otherwise)
- Date with `dateStyle: "full"` and times with `formatToLocalizedTime`, in the page's locale and 12h/24h setting — the same helpers the page's "When" block uses
- Timezone as its IANA name (see ADR-002)
- A timezone that isn't an IANA name falls back to UTC (see ADR-003)

**Booking page**

Location: `apps/web/modules/bookings/views/bookings-single-view.tsx`

- Secondary `sm` button under the date/time in the "When" row
- Uses `useCopy`; success and failure are reported with a toast
- The icon switches from `copy` to `check` for a few seconds after copying

## Edge Cases

- Viewer in a timezone where the booking lands on another calendar day: the date follows the viewer's wall clock
- Booking spanning a DST transition: start and end are each resolved by the timezone library
- Rescheduled booking: the page strikes through the former time; the summary carries the new one
- Invalid or offset-style timezone (`-03:00`): falls back to UTC
- Titles containing `/`, `<` or `&`: copied verbatim, no HTML escaping

## Out of Scope

- The booking details sheet on `/bookings` (host side)
- Cancelled bookings — the button is hidden
- Recurring series shown with all remaining occurrences — the button is hidden (see future-work.md)
- Embeds — the button is hidden (see ADR-004)
- Location, attendees or links in the summary
