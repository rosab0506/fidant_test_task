import { prisma } from "./prisma";
import {
  PLAN_LIMITS,
  isCacheStale,
  staleThreshold,
  calcStreak,
  calcUtilization,
  calcAvgDaily,
  dateKeyInTz,
} from "./utils";

export { PLAN_LIMITS };

export interface DayStats {
  date: string;
  committed: number;
  reserved: number;
  limit: number;
  utilization: number;
}

export interface UsageStats {
  plan: string;
  daily_limit: number;
  period: { from: string; to: string };
  days: DayStats[];
  summary: {
    total_committed: number;
    avg_daily: number;
    peak_day: { date: string; count: number };
    current_streak: number;
  };
}

/** ISO date string "YYYY-MM-DD" for a given offset from today */
// replaced by dateKeyInTz from utils — see below

/** Stale reservation threshold: 15 minutes ago */
// imported from utils

/** Compute raw aggregates for a single day directly from events */
async function computeDayFromEvents(
  userId: number,
  dk: string
): Promise<{ committed: number; reserved: number }> {
  const [committed, reserved] = await Promise.all([
    prisma.daily_usage_events.count({
      where: { user_id: userId, date_key: dk, status: "committed" },
    }),
    prisma.daily_usage_events.count({
      where: {
        user_id: userId,
        date_key: dk,
        status: "reserved",
        reserved_at: { gt: staleThreshold() },
      },
    }),
  ]);
  return { committed, reserved };
}

/** Upsert a cache entry for a given day */
async function upsertCache(
  userId: number,
  dk: string,
  committed: number,
  reserved: number
): Promise<void> {
  await prisma.daily_usage_cache.upsert({
    where: { user_id_date_key: { user_id: userId, date_key: dk } },
    update: { committed_count: committed, reserved_count: reserved, calculated_at: new Date() },
    create: { user_id: userId, date_key: dk, committed_count: committed, reserved_count: reserved },
  });
}

/**
 * Get stats for a single day, using cache when fresh.
 * Falls back to raw query if cache is missing or stale, then refreshes cache.
 */
async function getDayStats(
  userId: number,
  dk: string,
  limit: number,
  todayKey: string
): Promise<DayStats> {
  const isToday = dk === todayKey;

  const cached = await prisma.daily_usage_cache.findUnique({
    where: { user_id_date_key: { user_id: userId, date_key: dk } },
  });

  let committed: number;
  let reserved: number;

  if (cached && !isCacheStale(cached.calculated_at, isToday)) {
    committed = cached.committed_count;
    reserved = cached.reserved_count;
  } else {
    // Cache miss or stale — query raw events and refresh cache
    ({ committed, reserved } = await computeDayFromEvents(userId, dk));
    // Fire-and-forget cache update (don't block the response)
    upsertCache(userId, dk, committed, reserved).catch(console.error);
  }

  return {
    date: dk,
    committed,
    reserved,
    limit,
    utilization: calcUtilization(committed, limit),
  };
}

/** Calculate current streak: consecutive days (ending today) with at least 1 committed event */
// imported from utils

export async function getUserUsageStats(
  userId: number,
  planTier: string,
  days: number,
  tz?: string
): Promise<UsageStats> {
  const limit = PLAN_LIMITS[planTier] ?? PLAN_LIMITS.starter;
  const toDate = dateKeyInTz(0, tz);
  const fromDate = dateKeyInTz(days - 1, tz);

  // Build date keys for the period in the user's timezone
  const dateKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dateKeys.push(dateKeyInTz(i, tz));
  }

  // Fetch all days in parallel, passing todayKey so getDayStats doesn't recompute it
  const dayStats = await Promise.all(
    dateKeys.map((dk) => getDayStats(userId, dk, limit, toDate))
  );

  const totalCommitted = dayStats.reduce((sum, d) => sum + d.committed, 0);
  const avgDaily = calcAvgDaily(totalCommitted, days);

  const peakDay = dayStats.reduce(
    (best, d) => (d.committed > best.count ? { date: d.date, count: d.committed } : best),
    { date: toDate, count: 0 }
  );

  return {
    plan: planTier,
    daily_limit: limit,
    period: { from: fromDate, to: toDate },
    days: dayStats,
    summary: {
      total_committed: totalCommitted,
      avg_daily: avgDaily,
      peak_day: peakDay,
      current_streak: calcStreak(dayStats),
    },
  };
}
