import { describe, expect, it } from "vitest";

import dayjs from "@calcom/dayjs";

import { buildBookingSummary } from "./buildBookingSummary";

const labels = { what: "What", date: "Date", time: "Time", timezone: "Timezone", where: "Where" };
const base = {
  title: "30 min meeting between Alice and Bob",
  start: dayjs.utc("2026-11-23T13:00:00Z"),
  durationInMinutes: 30,
  timeZone: "America/Sao_Paulo",
  locale: "en-US",
  is24h: true,
  labels,
};

describe("buildBookingSummary", () => {
  it("includes title, date, time range, timezone and location", () => {
    const summary = buildBookingSummary({ ...base, location: "https://meet.example.com/abc" });
    expect(summary.split("\n")).toEqual([
      "What: 30 min meeting between Alice and Bob",
      "Date: Monday, November 23, 2026",
      "Time: 10:00 - 10:30",
      "Timezone: America/Sao_Paulo",
      "Where: https://meet.example.com/abc",
    ]);
  });

  it("converts date and time to the given timezone", () => {
    const summary = buildBookingSummary({
      ...base,
      start: dayjs.utc("2026-11-23T23:30:00Z"),
      timeZone: "Asia/Tokyo",
    });
    expect(summary).toContain("Date: Tuesday, November 24, 2026");
    expect(summary).toContain("Time: 08:30 - 09:00");
    expect(summary).toContain("Timezone: Asia/Tokyo");
  });

  it("uses 12h format when is24h is false", () => {
    const summary = buildBookingSummary({ ...base, is24h: false });
    expect(summary).toMatch(/Time: 10:00\sAM - 10:30\sAM/);
  });

  it("omits the location line when there is no location", () => {
    expect(buildBookingSummary({ ...base, location: "  " })).not.toContain("Where");
    expect(buildBookingSummary({ ...base, location: null })).not.toContain("Where");
  });

  it("shows only the start time when duration is unknown", () => {
    expect(buildBookingSummary({ ...base, durationInMinutes: undefined })).toContain("Time: 10:00\n");
  });
});
