import type { Dayjs } from "@calcom/dayjs";
import { formatToLocalizedDate, formatToLocalizedTime } from "@calcom/lib/dayjs";

export type BookingSummaryInput = {
  title: string;
  start: Dayjs;
  durationInMinutes?: number;
  timeZone: string;
  location?: string | null;
  locale?: string;
  is24h?: boolean;
  labels: { what: string; date: string; time: string; timezone: string; where: string };
};

/** Builds a plain-text booking summary (title, date, time, timezone and location). */
export const buildBookingSummary = ({
  title,
  start,
  durationInMinutes,
  timeZone,
  location,
  locale,
  is24h,
  labels,
}: BookingSummaryInput): string => {
  const formatTime = (d: Dayjs) =>
    formatToLocalizedTime({ date: d, locale, timeZone, hour12: is24h === undefined ? undefined : !is24h });
  const startTime = formatTime(start);
  const time = durationInMinutes
    ? `${startTime} - ${formatTime(start.add(durationInMinutes, "minute"))}`
    : startTime;

  const lines = [
    `${labels.what}: ${title}`,
    `${labels.date}: ${formatToLocalizedDate(start, locale, "full", timeZone)}`,
    `${labels.time}: ${time}`,
    `${labels.timezone}: ${timeZone}`,
  ];
  const trimmedLocation = location?.trim();
  if (trimmedLocation) lines.push(`${labels.where}: ${trimmedLocation}`);
  return lines.join("\n");
};
