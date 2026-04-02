import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit } from "../rateLimit";

// Each test uses a unique key to avoid cross-test state pollution
let keyCounter = 0;
function uniqueKey(): string {
  return `test-user-${++keyCounter}`;
}

describe("checkRateLimit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows requests under the limit", () => {
    const key = uniqueKey();
    const result = checkRateLimit(key, { limit: 5, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks remaining count correctly across multiple requests", () => {
    const key = uniqueKey();
    const opts = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit(key, opts).remaining).toBe(2);
    expect(checkRateLimit(key, opts).remaining).toBe(1);
    expect(checkRateLimit(key, opts).remaining).toBe(0);
  });

  it("blocks the request exactly when the limit is reached", () => {
    const key = uniqueKey();
    const opts = { limit: 2, windowMs: 60_000 };
    checkRateLimit(key, opts); // 1st
    checkRateLimit(key, opts); // 2nd — fills limit
    const result = checkRateLimit(key, opts); // 3rd — should be blocked
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("does not count blocked requests against the window", () => {
    const key = uniqueKey();
    const opts = { limit: 1, windowMs: 60_000 };
    checkRateLimit(key, opts); // allowed
    checkRateLimit(key, opts); // blocked — should NOT increment
    checkRateLimit(key, opts); // blocked — should NOT increment
    // Still only 1 timestamp in the window
    const result = checkRateLimit(key, opts);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after the window expires", () => {
    const key = uniqueKey();
    const opts = { limit: 2, windowMs: 60_000 };
    checkRateLimit(key, opts);
    checkRateLimit(key, opts);
    expect(checkRateLimit(key, opts).allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(61_000);

    const result = checkRateLimit(key, opts);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("uses sliding window — only evicts timestamps outside the window", () => {
    const key = uniqueKey();
    const opts = { limit: 3, windowMs: 60_000 };

    checkRateLimit(key, opts); // t=0
    vi.advanceTimersByTime(30_000);
    checkRateLimit(key, opts); // t=30s
    checkRateLimit(key, opts); // t=30s — limit hit

    // Advance to t=61s: the t=0 request falls out, but t=30s ones remain
    vi.advanceTimersByTime(31_000);
    const result = checkRateLimit(key, opts); // should be allowed (2 in window)
    expect(result.allowed).toBe(true);
  });

  it("returns a resetAt timestamp in the future", () => {
    const key = uniqueKey();
    const now = Date.now();
    const result = checkRateLimit(key, { limit: 5, windowMs: 60_000 });
    expect(result.resetAt).toBeGreaterThan(now);
    expect(result.resetAt).toBeLessThanOrEqual(now + 60_000);
  });

  it("isolates limits per key", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    const keyA = uniqueKey();
    const keyB = uniqueKey();
    checkRateLimit(keyA, opts); // fills keyA
    const result = checkRateLimit(keyB, opts); // keyB should still be allowed
    expect(result.allowed).toBe(true);
  });
});
