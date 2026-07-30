import { NextResponse } from "next/server";
import { handleMpesaCallback, PaymentValidationError } from "../../../../../payments/payment-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await handleMpesaCallback(body);
    return NextResponse.json(result, {
      status: 200,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error("mpesa_callback_failed", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
