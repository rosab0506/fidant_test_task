import type { DayStats } from "./usage";

export const PLAN_LIMITS: Record<string, number> = {
  starter: 30,
  pro: 100,
  executive: 500,
};

/** Stale reservation threshold: 15 minutes ago */
export function staleThreshold(): Date {
  return new Date(Date.now() - 15 * 60 * 1000);
}

/**
 * Cache staleness thresholds:
 * - Today's cache: stale after 2 minutes
 * - Past days: stale after 1 hour
 */
export function isCacheStale(calculatedAt: Date, isToday: boolean): boolean {
  const ageMs = Date.now() - calculatedAt.getTime();
  const threshold = isToday ? 2 * 60 * 1000 : 60 * 60 * 1000;
  return ageMs > threshold;
}

/**
 * Calculate current streak: consecutive days ending today with ≥1 committed event.
 * Input array can be in any order.
 */
export function calcStreak(days: DayStats[]): number {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].committed > 0) streak++;
    else break;
  }
  return streak;
}

/** Compute utilization rounded to 2 decimal places */
export function calcUtilization(committed: number, limit: number): number {
  return limit > 0 ? Math.round((committed / limit) * 100) / 100 : 0;
}

/** Compute avg daily committed over the full period (including zero days) */
export function calcAvgDaily(totalCommitted: number, days: number): number {
  return days > 0 ? Math.round((totalCommitted / days) * 10) / 10 : 0;
}

/**
 * Returns "YYYY-MM-DD" for a given date offset (0 = today) in the specified timezone.
 * Falls back to UTC if tz is undefined.
 */
export function dateKeyInTz(offsetDays: number, tz?: string): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  if (!tz) return d.toISOString().slice(0, 10);
  // Use Intl to format the date in the target timezone
  return d.toLocaleDateString("en-CA", { timeZone: tz }); // en-CA gives YYYY-MM-DD
}

/**
 * Validates a timezone string using the Intl API.
 * Returns true if the timezone is recognized, false otherwise.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
