import { NextResponse } from "next/server";
import { releaseExpiredReservations } from "../../../../checkout/checkout-service";
import { requireInternalCron } from "../internal-cron-auth";

export async function POST(request: Request) {
  const denied = requireInternalCron(request);
  if (denied) return denied;

  const result = await releaseExpiredReservations();
  return NextResponse.json(result);
}
