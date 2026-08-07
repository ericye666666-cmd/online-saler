import { NextResponse } from "next/server";
import { currentCustomerSession } from "../../../../auth/customer-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentCustomerSession();
  return NextResponse.json({ authenticated: Boolean(session), customer: session });
}
