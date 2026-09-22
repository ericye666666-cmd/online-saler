import { NextResponse } from "next/server";

/**
 * Shared bearer check for the internal cron endpoints. Returns a response when
 * the caller is not the scheduler, and null when the request may proceed.
 */
export function requireInternalCron(request: Request): NextResponse | null {
  const expected = process.env.INTERNAL_CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}
