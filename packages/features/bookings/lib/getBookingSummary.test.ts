import { describe, expect, it } from "vitest";
import { getBookingSummary } from "./getBookingSummary";

// Some ICU versions put a narrow no-break space before AM/PM; the assertions care about the values.
const summaryLines = (...args: Parameters<typeof getBookingSummary>) =>
  getBookingSummary(...args)
    .replace(/\u202f/g, " ")
    .split("\n");

const booking = {
  title: "30 Min Meeting between Alice and Bob",
  startTime: "2026-09-25T13:00:00.000Z",
  endTime: "2026-09-25T13:30:00.000Z",
};

describe("getBookingSummary", () => {
  it("renders title, date, time range and timezone in the viewer's timezone", () => {
    expect(summaryLines({ ...booking, timeZone: "America/Sao_Paulo", locale: "en", is24h: false })).toEqual([
      "30 Min Meeting between Alice and Bob",
      "Friday, September 25, 2026",
      "10:00 AM - 10:30 AM (America/Sao_Paulo)",
    ]);
  });

  it("honours the 24h time format", () => {
    expect(summaryLines({ ...booking, timeZone: "America/Sao_Paulo", locale: "en", is24h: true })[2]).toBe(
      "10:00 - 10:30 (America/Sao_Paulo)"
    );
  });

  it("localizes the date in the viewer's locale", () => {
    expect(summaryLines({ ...booking, timeZone: "America/Sao_Paulo", locale: "pt-BR", is24h: true })).toEqual(
      [
        "30 Min Meeting between Alice and Bob",
        "sexta-feira, 25 de setembro de 2026",
        "10:00 - 10:30 (America/Sao_Paulo)",
      ]
    );
  });

  it("uses the viewer's calendar day when the timezone puts the booking on another date", () => {
    expect(
      summaryLines({
        ...booking,
        startTime: "2026-09-25T02:00:00.000Z",
        endTime: "2026-09-25T02:30:00.000Z",
        timeZone: "America/Sao_Paulo",
        locale: "en",
        is24h: true,
      }).slice(1)
    ).toEqual(["Thursday, September 24, 2026", "23:00 - 23:30 (America/Sao_Paulo)"]);
  });

  it("resolves each end of the range on its own side of a DST transition", () => {
    // New York springs forward at 02:00 on 2026-03-08: this hour-long booking starts in EST, ends in EDT.
    expect(
      summaryLines({
        ...booking,
        startTime: "2026-03-08T06:30:00.000Z",
        endTime: "2026-03-08T07:30:00.000Z",
        timeZone: "America/New_York",
        locale: "en",
        is24h: false,
      })[2]
    ).toBe("1:30 AM - 3:30 AM (America/New_York)");
  });

  // "-03:00" is accepted by recent Intl implementations, but it is a fixed offset, not an IANA name.
  it.each([
    "Not/AZone",
    "-03:00",
    "+0530",
    "",
  ])("falls back to UTC for a non-IANA timezone (%j)", (timeZone) => {
    expect(summaryLines({ ...booking, timeZone, locale: "en", is24h: true }).slice(1)).toEqual([
      "Friday, September 25, 2026",
      "13:00 - 13:30 (UTC)",
    ]);
  });

  it("copies the title verbatim, without HTML escaping", () => {
    expect(
      summaryLines({
        ...booking,
        title: "Sync / Planning <Q4> & review",
        timeZone: "UTC",
        locale: "en",
        is24h: true,
      })[0]
    ).toBe("Sync / Planning <Q4> & review");
  });
});
