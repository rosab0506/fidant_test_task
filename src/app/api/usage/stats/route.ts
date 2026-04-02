import { NextRequest } from "next/server";
import { getAuthUser, errorResponse } from "@/lib/auth";
import { getUserUsageStats } from "@/lib/usage";
import { isValidTimezone } from "@/lib/utils";
import { checkRateLimit } from "@/lib/rateLimit";

const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 90;

// 60 requests per minute per user
const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(req: NextRequest) {
  // 1. Authenticate
  const user = await getAuthUser(req);
  if (!user) {
    return errorResponse(401, "Unauthorized");
  }

  // 2. Rate limit — keyed per user so limits are independent across accounts
  const rl = checkRateLimit(`stats:${user.id}`, RATE_LIMIT);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: { status: 429, message: "Too many requests. Please slow down." } }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(RATE_LIMIT.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // 3. Validate `days` query param
  const daysParam = req.nextUrl.searchParams.get("days");
  let days = DEFAULT_DAYS;

  if (daysParam !== null) {
    const parsed = parseInt(daysParam, 10);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      return errorResponse(400, "`days` must be an integer");
    }
    if (parsed < MIN_DAYS || parsed > MAX_DAYS) {
      return errorResponse(400, `\`days\` must be between ${MIN_DAYS} and ${MAX_DAYS}`);
    }
    days = parsed;
  }

  // 4. Validate optional `tz` query param (e.g. "America/New_York")
  const tzParam = req.nextUrl.searchParams.get("tz");
  let tz: string | undefined;

  if (tzParam !== null) {
    if (!isValidTimezone(tzParam)) {
      return errorResponse(400, `Invalid timezone: "${tzParam}". Use an IANA timezone name (e.g. "America/New_York")`);
    }
    tz = tzParam;
  }

  // 5. Compute and return stats, with rate limit headers on success
  const stats = await getUserUsageStats(user.id, user.plan_tier, days, tz);
  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-RateLimit-Limit": String(RATE_LIMIT.limit),
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
    },
  });
}
