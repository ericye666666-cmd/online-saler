import { NextResponse } from "next/server";
import {
  expireLapsedDepositHolds,
  sendDepositBalanceReminders
} from "../../../../checkout/deposit-service";
import { requireInternalCron } from "../internal-cron-auth";

/**
 * The seven-day deposit clock, run on a schedule. Reminders go out first so a
 * hold that is about to lapse gets its last warning before the same pass takes
 * the garment back; a shopper should never be told the item is gone in the same
 * minute they were told they had a day left.
 */
export async function POST(request: Request) {
  const denied = requireInternalCron(request);
  if (denied) return denied;

  const reminders = await sendDepositBalanceReminders();
  const lapsed = await expireLapsedDepositHolds();
  return NextResponse.json({ ...reminders, ...lapsed });
}
