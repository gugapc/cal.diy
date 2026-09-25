# Copy Booking Summary Documentation

## Overview

The booking page has a "Copy summary" button that copies the booking's title, date, time range and timezone as plain text.

## Screenshots

Screenshots will be added here.

## Where to Find It

Open a booking page (`/booking/{uid}`) — the confirmation page shown right after booking, or the link in the confirmation email. The button sits under the date and time in the "When" row.

## What Gets Copied

```
30 Min Meeting between Alice and Bob
Friday, September 25, 2026
10:00 AM - 10:30 AM (America/Sao_Paulo)
```

- Date and times are in your timezone, language and 12h/24h setting — the same values the page shows you
- The timezone is written as its IANA name so it reads the same in any language

## When the Button Is Hidden

- Cancelled bookings
- Recurring series shown with all their occurrences
- Booking pages inside an embed
