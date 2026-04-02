import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PLAN_LIMITS,
  isCacheStale,
  staleThreshold,
  calcStreak,
  calcUtilization,
  calcAvgDaily,
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
