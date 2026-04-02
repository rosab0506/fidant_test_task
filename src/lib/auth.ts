import { NextRequest } from "next/server";
import { prisma } from "./prisma";

export interface AuthUser {
  id: number;
  email: string;
  plan_tier: string;
}

/**
 * Minimal auth: reads user ID from the `x-user-id` header.
 *
 * In production this would validate a JWT or session token.
 * For this challenge, a simple header-based approach keeps the
 * focus on the analytics logic rather than auth infrastructure.
 */
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const userIdHeader = req.headers.get("x-user-id");
  if (!userIdHeader) return null;

  const userId = parseInt(userIdHeader, 10);
  if (isNaN(userId)) return null;

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, email: true, plan_tier: true },
  });

  return user;
}

/** Consistent error response shape */
export function errorResponse(status: number, message: string): Response {
  return Response.json({ error: { status, message } }, { status });
}
