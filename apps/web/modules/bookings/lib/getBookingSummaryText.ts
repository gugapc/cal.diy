import { formatToLocalizedDate, formatToLocalizedTime, formatToLocalizedTimezone } from "@calcom/lib/dayjs";
import type { TFunction } from "i18next";

const isUrl = (value: string): boolean => value.startsWith("http");

function formatTimeZone(date: Date, locale: string, timeZone: string): string {
  const localizedName = formatToLocalizedTimezone(date, locale, timeZone);
  return localizedName && localizedName !== timeZone ? `${localizedName} (${timeZone})` : timeZone;
}

function formatLocation(location: string, providerName?: string): string {
  return providerName && isUrl(location) ? `${providerName} - ${location}` : location;
}

export type BookingSummaryInput = {
  title: string;
  startTime: Date | string;
  endTime: Date | string;
  /** IANA time zone the booking is shown in, e.g. "America/Sao_Paulo". */
  timeZone: string;
  /** Location as displayed on the booking page (address, URL or message). */
  location?: string | null;
  /** Conferencing provider name (e.g. "Google Meet"), shown before the location when it is a URL. */
  locationProviderName?: string;
  locale: string;
  is24h: boolean;
  t: TFunction;
};

/**
 * Builds a plain-text summary of a booking (title, date, time, time zone and location),
 * formatted the same way the booking page displays it, so it can be pasted anywhere.
 */
export function getBookingSummaryText({
  title,
  startTime,
  endTime,
  timeZone,
  location,
  locationProviderName,
  locale,
  is24h,
  t,
}: BookingSummaryInput): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const formatTime = (date: Date) => formatToLocalizedTime({ date, locale, hour12: !is24h, timeZone });

  const lines = [
    `${t("title")}: ${title}`,
    `${t("date")}: ${formatToLocalizedDate(start, locale, "full", timeZone)}`,
    `${t("time")}: ${formatTime(start)} - ${formatTime(end)}`,
    `${t("timezone")}: ${formatTimeZone(start, locale, timeZone)}`,
  ];

  const trimmedLocation = location?.trim();
  if (trimmedLocation) {
    lines.push(`${t("location")}: ${formatLocation(trimmedLocation, locationProviderName)}`);
  }

  return lines.join("\n");
}
