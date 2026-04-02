/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request timestamps per key (e.g. user ID) within a rolling window.
 * Not suitable for multi-instance deployments — use Redis in production.
 */

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

export interface RateLimitOptions {
  /** Maximum number of requests allowed within the window. Default: 60 */
  limit?: number;
  /** Window size in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix ms timestamp when the oldest request falls out of the window
}

export function checkRateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  const windowStart = now - windowMs;

  const entry = store.get(key) ?? { timestamps: [] };

  // Evict timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  const allowed = entry.timestamps.length < limit;

  if (allowed) {
    entry.timestamps.push(now);
  }

  store.set(key, entry);

  const remaining = Math.max(0, limit - entry.timestamps.length);
  // Reset time: when the oldest request in the window will expire
  const oldest = entry.timestamps[0] ?? now;
  const resetAt = oldest + windowMs;

  return { allowed, remaining, resetAt };
}

/**
 * Periodically purge keys with empty windows to prevent unbounded memory growth.
 * Called automatically on module load — runs every 5 minutes.
 */
function scheduleCleanup(intervalMs = 5 * 60 * 1000): void {
  // Only schedule in server environments (not during tests/build)
  if (typeof setInterval === "undefined") return;
  setInterval(() => {
    const windowMs = 60_000;
    const cutoff = Date.now() - windowMs;
    for (const [key, entry] of store.entries()) {
      if (entry.timestamps.every((t) => t <= cutoff)) {
        store.delete(key);
      }
    }
  }, intervalMs).unref?.(); // .unref() so it doesn't keep the process alive in tests
}

scheduleCleanup();
