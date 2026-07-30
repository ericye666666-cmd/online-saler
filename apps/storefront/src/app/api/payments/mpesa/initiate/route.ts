import { NextResponse } from "next/server";
import { currentCustomerSession } from "../../../../../auth/customer-auth";
import {
  PaymentConflictError,
  PaymentValidationError,
  initiateMpesaPayment,
  paymentConfigurationErrorMessage
} from "../../../../../payments/payment-service";
import { MpesaConfigurationError, MpesaProviderError } from "../../../../../payments/mpesa-client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await currentCustomerSession();
  if (!session) return NextResponse.json({ error: "Sign in with Google before payment." }, { status: 401 });

  try {
    const body = await request.json() as { orderId?: string };
    const orderId = body.orderId?.trim();
    if (!orderId) throw new PaymentValidationError("Order ID is required.");

    const result = await initiateMpesaPayment(orderId, session.customerId);
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
    if (error instanceof MpesaProviderError) {
      return NextResponse.json({ error: paymentConfigurationErrorMessage(error) }, { status: 502 });
    }
    console.error("mpesa_initiate_failed", error);
    return NextResponse.json({ error: "M-Pesa payment could not be started. Please try again." }, { status: 500 });
  }
}
