import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PLAN_LIMITS,
  isCacheStale,
  staleThreshold,
  calcStreak,
  calcUtilization,
  calcAvgDaily,
  dateKeyInTz,
  isValidTimezone,
  buildCacheControl,
} from "../utils";
import type { DayStats } from "../usage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDay(date: string, committed: number, reserved = 0): DayStats {
  return { date, committed, reserved, limit: 30, utilization: committed / 30 };
}

// ─── PLAN_LIMITS ─────────────────────────────────────────────────────────────

describe("PLAN_LIMITS", () => {
  it("has correct limits for all tiers", () => {
    expect(PLAN_LIMITS.starter).toBe(30);
    expect(PLAN_LIMITS.pro).toBe(100);
    expect(PLAN_LIMITS.executive).toBe(500);
  });
});

// ─── staleThreshold ──────────────────────────────────────────────────────────

describe("staleThreshold", () => {
  it("returns a date 15 minutes in the past", () => {
    const before = Date.now();
    const threshold = staleThreshold().getTime();
    const after = Date.now();
    const expected = 15 * 60 * 1000;
    expect(before - threshold).toBeGreaterThanOrEqual(expected - 10);
    expect(after - threshold).toBeLessThanOrEqual(expected + 10);
  });
});

// ─── isCacheStale ─────────────────────────────────────────────────────────────

describe("isCacheStale", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe("today's cache (2-minute threshold)", () => {
    it("is fresh when calculated 1 minute ago", () => {
      const calculatedAt = new Date(Date.now() - 1 * 60 * 1000);
      expect(isCacheStale(calculatedAt, true)).toBe(false);
    });

    it("is stale when calculated 3 minutes ago", () => {
      const calculatedAt = new Date(Date.now() - 3 * 60 * 1000);
      expect(isCacheStale(calculatedAt, true)).toBe(true);
    });

    it("is not yet stale exactly at the 2-minute boundary (strict >)", () => {
      // isCacheStale uses ageMs > threshold (strict), so exactly at the boundary
      // the cache is still considered fresh. A millisecond later it becomes stale.
      const calculatedAt = new Date(Date.now() - 2 * 60 * 1000);
      expect(isCacheStale(calculatedAt, true)).toBe(false);
    });
  });

  describe("past day cache (1-hour threshold)", () => {
    it("is fresh when calculated 30 minutes ago", () => {
      const calculatedAt = new Date(Date.now() - 30 * 60 * 1000);
      expect(isCacheStale(calculatedAt, false)).toBe(false);
    });

    it("is stale when calculated 61 minutes ago", () => {
      const calculatedAt = new Date(Date.now() - 61 * 60 * 1000);
      expect(isCacheStale(calculatedAt, false)).toBe(true);
    });
  });
});

// ─── calcStreak ───────────────────────────────────────────────────────────────

describe("calcStreak", () => {
  it("returns 0 for empty array", () => {
    expect(calcStreak([])).toBe(0);
  });

  it("returns 0 when the most recent day has no commits", () => {
    const days = [
      makeDay("2026-03-30", 5),
      makeDay("2026-03-31", 3),
      makeDay("2026-04-01", 0),
    ];
    expect(calcStreak(days)).toBe(0);
  });

  it("counts consecutive days from the end", () => {
    const days = [
      makeDay("2026-03-29", 0),
      makeDay("2026-03-30", 5),
      makeDay("2026-03-31", 3),
      makeDay("2026-04-01", 8),
    ];
    expect(calcStreak(days)).toBe(3);
  });

  it("stops at the first zero day", () => {
    const days = [
      makeDay("2026-03-28", 10),
      makeDay("2026-03-29", 0),   // breaks streak
      makeDay("2026-03-30", 5),
      makeDay("2026-03-31", 3),
      makeDay("2026-04-01", 8),
    ];
    expect(calcStreak(days)).toBe(3);
  });

  it("handles all days having commits", () => {
    const days = [
      makeDay("2026-03-30", 1),
      makeDay("2026-03-31", 2),
      makeDay("2026-04-01", 3),
    ];
    expect(calcStreak(days)).toBe(3);
  });

  it("works regardless of input order", () => {
    const days = [
      makeDay("2026-04-01", 3),
      makeDay("2026-03-30", 1),
      makeDay("2026-03-31", 2),
    ];
    expect(calcStreak(days)).toBe(3);
  });
});

// ─── calcUtilization ─────────────────────────────────────────────────────────

describe("calcUtilization", () => {
  it("returns 0 when limit is 0", () => {
    expect(calcUtilization(10, 0)).toBe(0);
  });

  it("returns 0 when committed is 0", () => {
    expect(calcUtilization(0, 30)).toBe(0);
  });

  it("calculates correctly and rounds to 2 decimal places", () => {
    expect(calcUtilization(12, 30)).toBe(0.4);
    expect(calcUtilization(1, 3)).toBe(0.33);
  });

  it("caps at 1.0 is not enforced (raw ratio returned)", () => {
    // utilization can exceed 1 if committed > limit (edge case)
    expect(calcUtilization(35, 30)).toBeCloseTo(1.17, 2);
  });
});

// ─── calcAvgDaily ─────────────────────────────────────────────────────────────

describe("calcAvgDaily", () => {
  it("returns 0 when days is 0", () => {
    expect(calcAvgDaily(100, 0)).toBe(0);
  });

  it("calculates average rounded to 1 decimal place", () => {
    expect(calcAvgDaily(87, 7)).toBe(12.4);
    expect(calcAvgDaily(10, 3)).toBe(3.3);
  });

  it("returns exact value when evenly divisible", () => {
    expect(calcAvgDaily(30, 3)).toBe(10);
  });
});

// ─── isValidTimezone ──────────────────────────────────────────────────────────

describe("isValidTimezone", () => {
  it("accepts valid IANA timezone names", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("rejects invalid timezone strings", () => {
    expect(isValidTimezone("Not/ATimezone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("random string")).toBe(false);
  });
});

// ─── dateKeyInTz ─────────────────────────────────────────────────────────────

describe("dateKeyInTz", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns YYYY-MM-DD format", () => {
    vi.setSystemTime(new Date("2026-04-02T12:00:00Z"));
    const key = dateKeyInTz(0);
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns UTC date when no timezone given", () => {
    vi.setSystemTime(new Date("2026-04-02T12:00:00Z"));
    expect(dateKeyInTz(0)).toBe("2026-04-02");
  });

  it("returns correct date for offset days", () => {
    vi.setSystemTime(new Date("2026-04-02T12:00:00Z"));
    expect(dateKeyInTz(1)).toBe("2026-04-01");
    expect(dateKeyInTz(2)).toBe("2026-03-31");
  });

  it("respects timezone when date differs from UTC", () => {
    // At 01:00 UTC on Apr 2, it's still Apr 1 in New York (UTC-4 in EDT)
    vi.setSystemTime(new Date("2026-04-02T01:00:00Z"));
    expect(dateKeyInTz(0, "America/New_York")).toBe("2026-04-01");
    expect(dateKeyInTz(0, "UTC")).toBe("2026-04-02");
  });

  it("respects timezone ahead of UTC", () => {
    // At 23:00 UTC on Apr 1, it's already Apr 2 in Tokyo (UTC+9)
    vi.setSystemTime(new Date("2026-04-01T23:00:00Z"));
    expect(dateKeyInTz(0, "Asia/Tokyo")).toBe("2026-04-02");
    expect(dateKeyInTz(0, "UTC")).toBe("2026-04-01");
  });
});

// ─── buildCacheControl ────────────────────────────────────────────────────────

describe("buildCacheControl", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns private short TTL when period includes today", () => {
    vi.setSystemTime(new Date("2026-04-02T12:00:00Z"));
    // days=7 always includes today
    expect(buildCacheControl(7)).toBe("private, max-age=120, stale-while-revalidate=60");
  });

  it("returns private short TTL for days=1 (today only)", () => {
    vi.setSystemTime(new Date("2026-04-02T12:00:00Z"));
    expect(buildCacheControl(1)).toBe("private, max-age=120, stale-while-revalidate=60");
  });

  it("respects timezone when determining if today is included", () => {
    // At 01:00 UTC Apr 2, New York is still Apr 1 — so days=1 in NY tz is yesterday (Apr 1),
    // which IS today in NY, so still private
    vi.setSystemTime(new Date("2026-04-02T01:00:00Z"));
    expect(buildCacheControl(1, "America/New_York")).toBe(
      "private, max-age=120, stale-while-revalidate=60"
    );
  });
});
