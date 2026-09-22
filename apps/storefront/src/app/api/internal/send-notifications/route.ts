import { NextResponse } from "next/server";
import { dispatchPendingNotifications } from "../../../../notifications/notification-dispatch";
import { requireInternalCron } from "../internal-cron-auth";

export async function POST(request: Request) {
  const denied = requireInternalCron(request);
  if (denied) return denied;

  try {
    return NextResponse.json(await dispatchPendingNotifications());
  } catch (error) {
    console.error("send_notifications_failed", error);
    return NextResponse.json({ error: "Notification dispatch could not run." }, { status: 500 });
  }
}
