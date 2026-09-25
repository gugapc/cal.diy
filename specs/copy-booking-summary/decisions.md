# Copy Booking Summary Decisions

## ADR-001: Build the Text in Code vs a Translation Key

### Context

The summary could be a single i18n key such as `"{{title}}\n{{date}}\n{{time}} ({{timeZone}})"`, which would let translators reorder it.

### Options Considered

1. **Translation key with interpolation** — translatable layout, but i18next escapes interpolated values by default, so `America/Sao_Paulo` reaches the clipboard as `America&#x2F;Sao_Paulo`, and so does any title with a slash; turning escaping off for a string that carries user-controlled content is its own risk
2. **Plain-text lines built in code** — no escaping to fight; the date and times are already localized by `Intl`, so only the line layout is fixed

### Decision

Build the lines in `getBookingSummary`. The only fixed parts are the line breaks, the ` - ` between times and the parentheses around the timezone — the same punctuation the page itself hard-codes in its "When" block.

### Consequences

- Nothing in the copied text is HTML-escaped
- The layout can't be changed per language; if that's ever needed, it has to come with an explicit `escapeValue: false` and a review of what goes into the values

## ADR-002: IANA Name vs Localized Timezone Label

### Context

The page shows the timezone as a localized label, e.g. "(Brasilia Standard Time)". The copied text leaves the page and is read by someone else.

### Options Considered

1. **Localized label, as on the page** — friendlier, but it's in the copier's language, and for many zones `Intl` has no name and prints a fixed offset such as `GMT+05:00`, which stops being right after the next DST change
2. **IANA name** (`America/Sao_Paulo`) — unambiguous in any language, and the form the project uses to identify a timezone everywhere else

### Decision

IANA name. The maintainer's rules say timezones are identified by IANA names, never fixed offsets; a copied summary is something the reader will act on, which puts it closer to data than to display.

### Consequences

- The copied timezone differs in wording from the label on the page, while referring to the same zone
- The reader sees `America/Sao_Paulo` rather than "Brasilia Standard Time"

## ADR-003: Rejecting UTC Offsets as Timezones

### Context

`isSupportedTimeZone` checks a value by handing it to `Intl`. Recent `Intl` implementations (Node 24 included) accept UTC offsets such as `-03:00` as a `timeZone`, so that check alone lets a fixed offset through.

### Options Considered

1. **Trust `isSupportedTimeZone`** — an offset would be printed as the timezone
2. **Reject values starting with `+` or `-`, then check with `isSupportedTimeZone`** — IANA names never start with a sign

### Decision

Option 2, falling back to UTC. The project never guesses a local timezone: an unusable value becomes the neutral one, and the copied times are still correct, just in UTC.

### Consequences

- An offset-style timezone yields a UTC summary rather than the offset's wall clock
- `Etc/GMT+3`-style names are still accepted: they are IANA names

## ADR-004: Hiding the Button in Embeds

### Context

The embed iframe is created with `allow="payment"` only (`packages/embeds/embed-core/src/embed.ts`). Chromium blocks `navigator.clipboard.writeText` in a cross-origin iframe without `clipboard-write`.

### Options Considered

1. **Show the button in embeds** — it would fail with an error toast in Chromium-based browsers
2. **Add `clipboard-write` to the embed iframe** — touches the embed package every customer loads, a separate change with its own review
3. **Hide the button in embeds**

### Decision

Hide it (`!isEmbed`). A button that fails for most users is worse than no button.

### Consequences

- Embedded booking pages don't get the feature until the embed grants `clipboard-write` (future-work.md)
