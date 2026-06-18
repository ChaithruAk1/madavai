import { describe, it, expect } from "vitest";
import { computeNextRunAt, isActiveSchedule, sanitizeSchedule } from "../../server/schedule-next.mjs";

const U = Date.UTC;
describe("schedule-next (S4) — tz-aware next fire", () => {
  it("off => 0 (manual, never auto-fires)", () => {
    expect(computeNextRunAt({ mode: "off" }, U(2026, 0, 1, 8, 0))).toBe(0);
    expect(computeNextRunAt(null, U(2026, 0, 1, 8, 0))).toBe(0);
  });
  it("interval => fromTs + everyMinutes", () => {
    expect(computeNextRunAt({ mode: "interval", everyMinutes: 30 }, 1000000)).toBe(1000000 + 30 * 60000);
    expect(computeNextRunAt({ mode: "interval" }, 0)).toBe(60 * 60000); // default 60
  });
  it("daily (UTC): returns today's HH:MM if still ahead, else tomorrow's", () => {
    expect(computeNextRunAt({ mode: "daily", time: "09:00" }, U(2026, 0, 1, 8, 0), "UTC")).toBe(U(2026, 0, 1, 9, 0));
    expect(computeNextRunAt({ mode: "daily", time: "09:00" }, U(2026, 0, 1, 10, 0), "UTC")).toBe(U(2026, 0, 2, 9, 0));
  });
  it("daily honors a fixed-offset tz (Asia/Kolkata, +5:30)", () => {
    // 09:00 IST == 03:30 UTC
    expect(computeNextRunAt({ mode: "daily", time: "09:00" }, U(2026, 5, 1, 0, 0), "Asia/Kolkata")).toBe(U(2026, 5, 1, 3, 30));
  });
  it("daily is DST-correct (America/New_York): 09:00 local => 14:00 UTC in winter, 13:00 UTC in summer", () => {
    expect(computeNextRunAt({ mode: "daily", time: "09:00" }, U(2026, 0, 15, 0, 0), "America/New_York")).toBe(U(2026, 0, 15, 14, 0)); // EST
    expect(computeNextRunAt({ mode: "daily", time: "09:00" }, U(2026, 6, 15, 0, 0), "America/New_York")).toBe(U(2026, 6, 15, 13, 0)); // EDT
  });
  it("weekly (UTC): next Monday 09:00", () => {
    // 2026-01-01 is a Thursday; next Monday is 2026-01-05.
    expect(computeNextRunAt({ mode: "weekly", weekday: 1, time: "09:00" }, U(2026, 0, 1, 12, 0), "UTC")).toBe(U(2026, 0, 5, 9, 0));
  });
  it("weekly: same weekday but time already passed => +7 days", () => {
    // 2026-01-05 is a Monday; 10:00 is past 09:00 => next Monday 2026-01-12.
    expect(computeNextRunAt({ mode: "weekly", weekday: 1, time: "09:00" }, U(2026, 0, 5, 10, 0), "UTC")).toBe(U(2026, 0, 12, 9, 0));
  });
  it("always returns a time strictly in the future for active modes", () => {
    const now = U(2026, 2, 8, 7, 30); // around US DST spring-forward day
    for (const sc of [{ mode: "interval", everyMinutes: 15 }, { mode: "daily", time: "09:00" }, { mode: "weekly", weekday: 3, time: "09:00" }]) {
      expect(computeNextRunAt(sc, now, "America/New_York")).toBeGreaterThan(now);
    }
  });
  it("sanitizeSchedule coerces bad input to a safe shape", () => {
    expect(sanitizeSchedule({ mode: "bogus" })).toEqual({ mode: "off" });
    expect(sanitizeSchedule({ mode: "interval", everyMinutes: "5" })).toEqual({ mode: "interval", everyMinutes: 5 });
    expect(sanitizeSchedule({ mode: "interval" })).toEqual({ mode: "interval", everyMinutes: 60 });
    expect(sanitizeSchedule({ mode: "daily", time: "7:5" })).toEqual({ mode: "daily", time: "09:00" }); // bad HH:MM -> default
    expect(sanitizeSchedule({ mode: "weekly", weekday: 9, time: "06:30" })).toEqual({ mode: "weekly", time: "06:30", weekday: 6 });
    expect(sanitizeSchedule(null)).toEqual({ mode: "off" });
  });
  it("isActiveSchedule", () => {
    expect(isActiveSchedule({ mode: "off" })).toBe(false);
    expect(isActiveSchedule({ mode: "interval" })).toBe(true);
    expect(isActiveSchedule({ mode: "daily" })).toBe(true);
    expect(isActiveSchedule({ mode: "weekly" })).toBe(true);
    expect(isActiveSchedule(null)).toBe(false);
  });
});
