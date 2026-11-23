import { TimeFormat } from "@calcom/lib/timeFormat";
import { describe, expect, it } from "vitest";
import { BUSINESS_HOURS, formatBusinessHour, isOutsideBusinessHours } from "./businessHours";

describe("isOutsideBusinessHours", () => {
  const timeZone = "America/Sao_Paulo";

  it("should return false for a slot inside the window on a weekday", () => {
    // Tuesday 10:00 in Sao Paulo
    expect(isOutsideBusinessHours({ startTime: "2026-09-01T13:00:00.000Z", timeZone })).toBe(false);
  });

  it("should return true for a slot on a weekend", () => {
    // Saturday 10:00 in Sao Paulo
    expect(isOutsideBusinessHours({ startTime: "2026-09-05T13:00:00.000Z", timeZone })).toBe(true);
  });

  it("should return true for a slot before opening time", () => {
    // Tuesday 07:59 in Sao Paulo
    expect(isOutsideBusinessHours({ startTime: "2026-09-01T10:59:00.000Z", timeZone })).toBe(true);
  });

  it("should return false for a slot starting exactly at opening time", () => {
    // Tuesday 08:00 in Sao Paulo
    expect(isOutsideBusinessHours({ startTime: "2026-09-01T11:00:00.000Z", timeZone })).toBe(false);
  });

  it("should return true for a slot starting exactly at closing time", () => {
    // Tuesday 18:00 in Sao Paulo
    expect(isOutsideBusinessHours({ startTime: "2026-09-01T21:00:00.000Z", timeZone })).toBe(true);
  });

  it("should return true when the booking runs past closing time", () => {
    // Tuesday 17:30 + 60min ends at 18:30 in Sao Paulo
    expect(
      isOutsideBusinessHours({
        startTime: "2026-09-01T20:30:00.000Z",
        durationInMinutes: 60,
        timeZone,
      })
    ).toBe(true);
  });

  it("should return false when the booking ends exactly at closing time", () => {
    // Tuesday 17:30 + 30min ends at 18:00 in Sao Paulo
    expect(
      isOutsideBusinessHours({
        startTime: "2026-09-01T20:30:00.000Z",
        durationInMinutes: 30,
        timeZone,
      })
    ).toBe(false);
  });

  it("should judge the very same instant by the viewer's timezone", () => {
    // Tuesday 10:00 in Sao Paulo is already 22:00 in Tokyo
    const startTime = "2026-09-01T13:00:00.000Z";

    expect(isOutsideBusinessHours({ startTime, timeZone: "America/Sao_Paulo" })).toBe(false);
    expect(isOutsideBusinessHours({ startTime, timeZone: "Asia/Tokyo" })).toBe(true);
  });

  it("should follow the DST offset in effect on the slot's date", () => {
    // 12:30 UTC is 08:30 EDT in July (inside), but 07:30 EST in January (outside)
    expect(
      isOutsideBusinessHours({ startTime: "2026-07-01T12:30:00.000Z", timeZone: "America/New_York" })
    ).toBe(false);
    expect(
      isOutsideBusinessHours({ startTime: "2026-01-02T12:30:00.000Z", timeZone: "America/New_York" })
    ).toBe(true);
  });

  it("should fall back to UTC when the timezone is unusable", () => {
    // Tuesday 22:00 UTC, which would be inside the window in Tokyo
    expect(isOutsideBusinessHours({ startTime: "2026-09-01T22:00:00.000Z", timeZone: "Not/AZone" })).toBe(
      true
    );
    // Tuesday 10:00 UTC
    expect(isOutsideBusinessHours({ startTime: "2026-09-01T10:00:00.000Z", timeZone: "Not/AZone" })).toBe(
      false
    );
  });

  it("should not warn when there is nothing readable to judge", () => {
    expect(isOutsideBusinessHours({ startTime: null, timeZone })).toBe(false);
    expect(isOutsideBusinessHours({ startTime: "not-a-date", timeZone })).toBe(false);
  });
});

describe("formatBusinessHour", () => {
  it("should format the boundaries following the locale derived time format", () => {
    expect(formatBusinessHour(BUSINESS_HOURS.startHour, TimeFormat.TWELVE_HOUR)).toBe("8:00am");
    expect(formatBusinessHour(BUSINESS_HOURS.endHour, TimeFormat.TWELVE_HOUR)).toBe("6:00pm");
    expect(formatBusinessHour(BUSINESS_HOURS.startHour, TimeFormat.TWENTY_FOUR_HOUR)).toBe("08:00");
    expect(formatBusinessHour(BUSINESS_HOURS.endHour, TimeFormat.TWENTY_FOUR_HOUR)).toBe("18:00");
  });
});
