import { describe, expect, it } from "vitest";
import { addDays, ageInDays, daysBetween, parseIsoDate, toIsoDate } from "./time";

describe("parseIsoDate", () => {
  it("reads a bare calendar date at UTC midnight", () => {
    expect(parseIsoDate("2026-09-18")).toBe(Date.UTC(2026, 8, 18));
  });

  it("ignores time-of-day and offset, so results never depend on the host timezone", () => {
    const day = Date.UTC(2026, 8, 18);
    expect(parseIsoDate("2026-09-18T00:00:00Z")).toBe(day);
    expect(parseIsoDate("2026-09-18T23:59:59Z")).toBe(day);
    expect(parseIsoDate("2026-09-18T23:40:00-07:00")).toBe(day);
    expect(parseIsoDate("2026-09-18T10:00:00")).toBe(day);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseIsoDate("  2026-09-18  ")).toBe(Date.UTC(2026, 8, 18));
  });

  it("rejects dates that do not exist instead of rolling them forward", () => {
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-00-10")).toBeNull();
    expect(parseIsoDate("2026-04-00")).toBeNull();
  });

  it("accepts a real leap day and rejects a fake one", () => {
    expect(parseIsoDate("2024-02-29")).toBe(Date.UTC(2024, 1, 29));
    expect(parseIsoDate("2026-02-29")).toBeNull();
  });

  it("rejects non-dates", () => {
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("last Tuesday")).toBeNull();
    expect(parseIsoDate("18/09/2026")).toBeNull();
    expect(parseIsoDate("2026-9-18")).toBeNull();
  });
});

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween("2026-09-18", "2026-09-25")).toBe(7);
  });

  it("is negative when the later date precedes the earlier one", () => {
    expect(daysBetween("2026-09-25", "2026-09-18")).toBe(-7);
  });

  it("is zero for the same day", () => {
    expect(daysBetween("2026-09-25", "2026-09-25")).toBe(0);
  });

  it("crosses a month, a year and a DST shift exactly", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    // US DST ends 2026-11-01. A naive local-time diff would give 23 hours here.
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("counts a leap year as 366 days", () => {
    expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
    expect(daysBetween("2025-01-01", "2026-01-01")).toBe(365);
  });

  it("is null when either side is unparseable", () => {
    expect(daysBetween("nope", "2026-09-25")).toBeNull();
    expect(daysBetween("2026-09-25", "nope")).toBeNull();
  });
});

describe("ageInDays", () => {
  it("measures a fact's age against asOf", () => {
    expect(ageInDays("2026-03-12", "2026-09-25")).toBe(197);
  });

  it("clamps a future-dated fact to zero rather than reporting a negative age", () => {
    expect(ageInDays("2026-10-01", "2026-09-25")).toBe(0);
  });

  it("is null when recency cannot be established", () => {
    expect(ageInDays("unknown date", "2026-09-25")).toBeNull();
  });
});

describe("toIsoDate", () => {
  it("renders UTC-midnight millis as a bare calendar date", () => {
    expect(toIsoDate(Date.UTC(2026, 8, 26))).toBe("2026-09-26");
  });

  it("round-trips with parseIsoDate", () => {
    for (const iso of ["2026-09-26", "2024-02-29", "1999-12-31", "2100-01-01"]) {
      expect(toIsoDate(parseIsoDate(iso)!)).toBe(iso);
    }
  });

  it("drops any time-of-day rather than rendering it", () => {
    expect(toIsoDate(Date.UTC(2026, 8, 26, 23, 59, 59))).toBe("2026-09-26");
  });
});
