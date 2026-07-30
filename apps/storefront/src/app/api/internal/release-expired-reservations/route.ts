import { NextResponse } from "next/server";
import { releaseExpiredReservations } from "../../../../checkout/checkout-service";

export async function POST(request: Request) {
  const expected = process.env.INTERNAL_CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await releaseExpiredReservations();
  return NextResponse.json(result);
}
