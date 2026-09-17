import { NextResponse } from "next/server";
import { checkoutViewers, resolveOrderViewer } from "../../../../../auth/checkout-identity";
import {
  PaymentConflictError,
  PaymentValidationError,
  initiateMpesaPayment,
  paymentConfigurationErrorMessage
} from "../../../../../payments/payment-service";
import { MpesaConfigurationError, MpesaProviderError } from "../../../../../payments/mpesa-client";
import { MpesaProductionGuardError } from "../../../../../payments/mpesa-production-guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const viewers = await checkoutViewers();
  if (!viewers.length) return NextResponse.json({ error: "Start checkout again before paying." }, { status: 401 });

  try {
    const body = await request.json() as { orderId?: string };
    const orderId = body.orderId?.trim();
    if (!orderId) throw new PaymentValidationError("Order ID is required.");
    const customerId = await resolveOrderViewer(orderId, viewers);
    if (!customerId) throw new PaymentValidationError("Order was not found.");

    const result = await initiateMpesaPayment(orderId, customerId);
    return NextResponse.json(result, {
      status: 201,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PaymentConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof MpesaConfigurationError) {
      return NextResponse.json({ error: paymentConfigurationErrorMessage(error) }, { status: 503 });
    }
    if (error instanceof MpesaProductionGuardError) {
      return NextResponse.json({ error: paymentConfigurationErrorMessage(error) }, { status: 403 });
    }
    if (error instanceof MpesaProviderError) {
      return NextResponse.json({ error: paymentConfigurationErrorMessage(error) }, { status: 502 });
    }
    console.error("mpesa_initiate_failed", error);
    return NextResponse.json({ error: "M-Pesa payment could not be started. Please try again." }, { status: 500 });
  }
}
