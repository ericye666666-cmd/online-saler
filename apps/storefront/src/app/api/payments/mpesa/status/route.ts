import { NextRequest, NextResponse } from "next/server";
import { currentCustomerSession } from "../../../../../auth/customer-auth";
import { getPaymentStatus, PaymentValidationError } from "../../../../../payments/payment-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await currentCustomerSession();
  if (!session) return NextResponse.json({ error: "Sign in with Google before payment." }, { status: 401 });

  try {
    const orderId = request.nextUrl.searchParams.get("orderId")?.trim();
    if (!orderId) throw new PaymentValidationError("Order ID is required.");
    const result = await getPaymentStatus(orderId, session.customerId);
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("mpesa_status_failed", error);
    return NextResponse.json({ error: "Payment status could not be loaded." }, { status: 500 });
  }
}
