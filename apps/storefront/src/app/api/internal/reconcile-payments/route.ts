import { NextResponse } from "next/server";
import { reconcilePendingPayments } from "../../../../payments/payment-reconciliation";
import { requireInternalCron } from "../internal-cron-auth";

export async function POST(request: Request) {
  const denied = requireInternalCron(request);
  if (denied) return denied;

  try {
    return NextResponse.json(await reconcilePendingPayments());
  } catch (error) {
    console.error("reconcile_payments_failed", error);
    return NextResponse.json({ error: "Payment reconciliation could not run." }, { status: 500 });
  }
}
