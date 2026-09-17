import { NextRequest, NextResponse } from "next/server";
import { checkoutViewers, resolveOrderViewer } from "../../../../../auth/checkout-identity";
import { getPaymentStatus, PaymentValidationError } from "../../../../../payments/payment-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const viewers = await checkoutViewers();
  if (!viewers.length) return NextResponse.json({ error: "Start checkout again before paying." }, { status: 401 });

  try {
    const orderId = request.nextUrl.searchParams.get("orderId")?.trim();
    if (!orderId) throw new PaymentValidationError("Order ID is required.");
    const customerId = await resolveOrderViewer(orderId, viewers);
    if (!customerId) throw new PaymentValidationError("Order was not found.");
    const result = await getPaymentStatus(orderId, customerId);
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
