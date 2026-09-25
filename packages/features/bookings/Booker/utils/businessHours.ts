import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import type { TimeFormat } from "@calcom/lib/timeFormat";

/**
 * Business hours are Mon-Fri, 08:00-18:00. There is no "house" timezone: the window is
 * always evaluated in the timezone of whoever is looking at the booker, never in a fixed one.
 */
export const BUSINESS_HOURS = {
  startHour: 8,
  endHour: 18,
  /** Weekday numbers as returned by `dayjs().day()`: 1 = Monday ... 5 = Friday */
  workingWeekdays: [1, 2, 3, 4, 5],
};

/** We never guess a local timezone: an unusable IANA name falls back to the neutral one. */
const FALLBACK_TIME_ZONE = "UTC";

const OPENS_AT_MINUTE = BUSINESS_HOURS.startHour * 60;
const CLOSES_AT_MINUTE = BUSINESS_HOURS.endHour * 60;

const _minutesIntoDay = (date: Dayjs) => date.hour() * 60 + date.minute();

const _inTimeZone = (date: string, timeZone: string) => {
  const parsed = dayjs(date);
  // `dayjs.tz` throws on an invalid date instead of returning an invalid instance.
  if (!parsed.isValid()) return parsed;

  try {
    return parsed.tz(timeZone);
  } catch {
    // `dayjs.tz` throws on anything Intl doesn't recognize as an IANA timezone name.
    return parsed.tz(FALLBACK_TIME_ZONE);
  }
};

/**
 * Formats one of the business hours boundaries for display, honouring the time format
 * (12h or 24h) derived from the booker's locale.
 */
export const formatBusinessHour = (hour: number, timeFormat: TimeFormat) =>
  // UTC has no DST, so the boundary can never be shifted away by a transition happening today.
  dayjs
    .utc()
    .hour(hour)
    .minute(0)
    .format(timeFormat);

/**
 * Whether a slot falls, even partially, outside Mon-Fri 08:00-18:00 in `timeZone`.
 * A slot we can't read is never reported as outside: staying silent beats warning wrongly.
 */
export const isOutsideBusinessHours = ({
  startTime,
  durationInMinutes,
  timeZone,
}: {
  /** Slot start in ISO format */
  startTime: string | null;
  /** When known, the booking also has to end before closing time */
  durationInMinutes?: number | null;
  timeZone: string;
}) => {
  if (!startTime) return false;

  const start = _inTimeZone(startTime, timeZone);
  if (!start.isValid()) return false;

  if (!BUSINESS_HOURS.workingWeekdays.includes(start.day())) return true;

  const startsAtMinute = _minutesIntoDay(start);
  if (startsAtMinute < OPENS_AT_MINUTE || startsAtMinute >= CLOSES_AT_MINUTE) return true;

  if (!durationInMinutes) return false;

  const end = start.add(durationInMinutes, "minute");
  // Running into the next day also means running past closing time.
  return !end.isSame(start, "day") || _minutesIntoDay(end) > CLOSES_AT_MINUTE;
};
