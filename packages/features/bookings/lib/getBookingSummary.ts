import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { formatToLocalizedDate, formatToLocalizedTime, isSupportedTimeZone } from "@calcom/lib/dayjs";

/** We never guess a local timezone: an unusable IANA name falls back to the neutral one. */
const FALLBACK_TIME_ZONE = "UTC";

// Recent Intl implementations accept UTC offsets such as "-03:00" as a timeZone, so
// `isSupportedTimeZone` alone would let a fixed offset through. IANA names never start with a sign.
const isIanaTimeZone = (timeZone: string) => !/^[+-]/.test(timeZone) && isSupportedTimeZone(timeZone);

/**
 * Plain-text summary of a booking — title, date, time range and timezone — for the viewer to
 * paste elsewhere. It shows the same wall-clock values the booking page shows that viewer.
 *
 * Built as plain text rather than through a translation key: i18next escapes interpolated values,
 * so a title or an IANA name containing a slash would be copied as `&#x2F;`.
 */
export const getBookingSummary = ({
  title,
  startTime,
  endTime,
  timeZone,
  locale,
  is24h,
}: {
  title: string;
  startTime: Date | string;
  endTime: Date | string;
  /** IANA name of the viewer's timezone */
  timeZone: string;
  locale: string;
  is24h: boolean;
}) => {
  const tz = isIanaTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
  const start = dayjs(startTime);
  const end = dayjs(endTime);
  const formatTime = (date: Dayjs) => formatToLocalizedTime({ date, locale, hour12: !is24h, timeZone: tz });

  return [
    title,
    formatToLocalizedDate(start, locale, "full", tz),
    // The IANA name rather than the localized label the page shows: whoever reads the pasted text
    // may use another locale, and Intl labels many zones with a fixed offset such as "GMT+05:00".
    `${formatTime(start)} - ${formatTime(end)} (${tz})`,
  ].join("\n");
};
