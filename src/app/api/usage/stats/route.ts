import { NextRequest } from "next/server";
import { getAuthUser, errorResponse } from "@/lib/auth";
import { getUserUsageStats } from "@/lib/usage";

const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 90;

export async function GET(req: NextRequest) {
  // 1. Authenticate
  const user = await getAuthUser(req);
  if (!user) {
    return errorResponse(401, "Unauthorized");
  }

  // 2. Validate `days` query param
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

  // 3. Compute and return stats
  const stats = await getUserUsageStats(user.id, user.plan_tier, days);
  return Response.json(stats);
}
