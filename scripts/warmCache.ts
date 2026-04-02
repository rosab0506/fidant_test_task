/// <reference types="node" />
/**
 * Cache warming script
 *
 * Pre-calculates daily aggregates for all active users and upserts them
 * into `daily_usage_cache`, so the stats endpoint doesn't hit raw events
 * on the first request of the day.
 *
 * Usage:
 *   npm run cache:warm [-- --days=7]
 *
 * Intended to be run as a cron job (e.g. daily at midnight, or every hour).
 */

import { PrismaClient } from "@prisma/client";
import { staleThreshold } from "../src/lib/utils";

const prisma = new PrismaClient({ log: ["error"] });

const DEFAULT_DAYS = 7;

function parseDaysArg(): number {
  const arg = process.argv.find((a) => a.startsWith("--days="));
  if (!arg) return DEFAULT_DAYS;
  const n = parseInt(arg.split("=")[1], 10);
  return isNaN(n) || n < 1 ? DEFAULT_DAYS : n;
}

/** Build the list of date keys for the past N days (UTC) */
function buildDateKeys(days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

/** Find all user IDs that had at least one event in the target date range */
async function getActiveUserIds(dateKeys: string[]): Promise<number[]> {
  const rows = await prisma.daily_usage_events.findMany({
    where: { date_key: { in: dateKeys } },
    select: { user_id: true },
    distinct: ["user_id"],
  });
  return rows.map((r: { user_id: number }) => r.user_id);
}

/** Compute committed + non-stale reserved counts for one user/day */
async function computeAggregates(
  userId: number,
  dateKey: string
): Promise<{ committed: number; reserved: number }> {
  const [committed, reserved] = await Promise.all([
    prisma.daily_usage_events.count({
      where: { user_id: userId, date_key: dateKey, status: "committed" },
    }),
    prisma.daily_usage_events.count({
      where: {
        user_id: userId,
        date_key: dateKey,
        status: "reserved",
        reserved_at: { gt: staleThreshold() },
      },
    }),
  ]);
  return { committed, reserved };
}

async function main(): Promise<void> {
  const days = parseDaysArg();
  const dateKeys = buildDateKeys(days);
  const today = dateKeys[0];

  console.log(
    `[warmCache] Warming cache for last ${days} days (${dateKeys[dateKeys.length - 1]} → ${today})`
  );

  const userIds = await getActiveUserIds(dateKeys);
  console.log(`[warmCache] Found ${userIds.length} active user(s)`);

  let upserted = 0;
  let skipped = 0;

  for (const userId of userIds) {
    for (const dk of dateKeys) {
      const isToday = dk === today;

      // Skip past-day entries that are already fresh (< 1 hour old)
      if (!isToday) {
        const existing = await prisma.daily_usage_cache.findUnique({
          where: { user_id_date_key: { user_id: userId, date_key: dk } },
          select: { calculated_at: true },
        });
        if (existing) {
          const ageMs = Date.now() - existing.calculated_at.getTime();
          if (ageMs < 60 * 60 * 1000) {
            skipped++;
            continue;
          }
        }
      }

      const { committed, reserved } = await computeAggregates(userId, dk);

      await prisma.daily_usage_cache.upsert({
        where: { user_id_date_key: { user_id: userId, date_key: dk } },
        update: { committed_count: committed, reserved_count: reserved, calculated_at: new Date() },
        create: {
          user_id: userId,
          date_key: dk,
          committed_count: committed,
          reserved_count: reserved,
        },
      });

      upserted++;
    }
  }

  console.log(`[warmCache] Done — ${upserted} upserted, ${skipped} skipped (still fresh)`);
}

main()
  .catch((err) => {
    console.error("[warmCache] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
