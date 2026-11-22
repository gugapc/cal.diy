import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { type BookingSummaryInput, getBookingSummaryText } from "./getBookingSummaryText";

const labels: Record<string, string> = {
  title: "Title",
  date: "Date",
  time: "Time",
  timezone: "Timezone",
  location: "Location",
};
const t = ((key: string) => labels[key] ?? key) as unknown as TFunction;

// Newer ICU versions separate the time from AM/PM with a narrow no-break space
const normalizeSpaces = (text: string) => text.replace(/[\u202f\u00a0]/g, " ");

const buildSummary = (overrides: Partial<BookingSummaryInput> = {}) =>
  normalizeSpaces(
    getBookingSummaryText({
      title: "30 min meeting between Jane Doe and John Smith",
      startTime: "2026-11-23T13:00:00.000Z",
      endTime: "2026-11-23T13:30:00.000Z",
      timeZone: "America/Sao_Paulo",
      location: "Av. Paulista, 1000 - São Paulo",
      locale: "en",
      is24h: false,
      t,
      ...overrides,
    })
  );

describe("getBookingSummaryText", () => {
  it("includes title, date, time, time zone and location, one per line", () => {
    expect(buildSummary().split("\n")).toEqual([
      "Title: 30 min meeting between Jane Doe and John Smith",
      "Date: Monday, November 23, 2026",
      "Time: 10:00 AM - 10:30 AM",
      "Timezone: Brasilia Standard Time (America/Sao_Paulo)",
      "Location: Av. Paulista, 1000 - São Paulo",
    ]);
  });

  it("uses the 24-hour clock when is24h is true", () => {
    expect(buildSummary({ is24h: true })).toContain("Time: 10:00 - 10:30");
  });

  it("converts date and time to the given time zone, including day changes", () => {
    const summary = buildSummary({
      startTime: "2026-11-23T23:30:00.000Z",
      endTime: "2026-11-24T00:15:00.000Z",
      timeZone: "Asia/Tokyo",
    });

    expect(summary).toContain("Date: Tuesday, November 24, 2026");
    expect(summary).toContain("Time: 8:30 AM - 9:15 AM");
    expect(summary).toContain("Timezone: Japan Standard Time (Asia/Tokyo)");
  });

  it("accepts Date objects as start and end times", () => {
    const summary = buildSummary({
      startTime: new Date("2026-11-23T13:00:00.000Z"),
      endTime: new Date("2026-11-23T14:00:00.000Z"),
    });

    expect(summary).toContain("Date: Monday, November 23, 2026");
    expect(summary).toContain("Time: 10:00 AM - 11:00 AM");
  });

  it("formats date, time and time zone name in the given locale", () => {
    const summary = buildSummary({ locale: "pt-BR", is24h: true });

    expect(summary).toContain("Date: segunda-feira, 23 de novembro de 2026");
    expect(summary).toContain("Time: 10:00 - 10:30");
    expect(summary).toContain("Timezone: Horário Padrão de Brasília (America/Sao_Paulo)");
  });

  it("prefixes a meeting URL with the provider name", () => {
    const summary = buildSummary({
      location: "https://meet.google.com/abc-defg-hij",
      locationProviderName: "Google Meet",
    });

    expect(summary).toContain("Location: Google Meet - https://meet.google.com/abc-defg-hij");
  });

  it("keeps a meeting URL as is when the provider is unknown", () => {
    const summary = buildSummary({ location: "https://example.com/my-room" });

    expect(summary).toContain("Location: https://example.com/my-room");
  });

  it("does not prefix a non-URL location with the provider name", () => {
    const summary = buildSummary({ location: "+55 11 99999-0000", locationProviderName: "Phone" });

    expect(summary).toContain("Location: +55 11 99999-0000");
  });

  it.each([null, undefined, "", "   "])("omits the location line when location is %j", (location) => {
    const summary = buildSummary({ location });

    expect(summary).not.toContain("Location:");
    expect(summary.split("\n")).toHaveLength(4);
  });

  it("translates every label", () => {
    const summary = getBookingSummaryText({
      title: "Demo",
      startTime: "2026-11-23T13:00:00.000Z",
      endTime: "2026-11-23T13:30:00.000Z",
      timeZone: "UTC",
      location: "Office",
      locale: "en",
      is24h: true,
      t: ((key: string) => `[${key}]`) as unknown as TFunction,
    });

    expect(summary.split("\n").map((line) => line.split(": ")[0])).toEqual([
      "[title]",
      "[date]",
      "[time]",
      "[timezone]",
      "[location]",
    ]);
  });
});
