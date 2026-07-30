import { FulfillmentMethod } from "@online-saler/database";
import { NextResponse } from "next/server";
import { currentCustomerSession } from "../../../../auth/customer-auth";
import {
  CheckoutConflictError,
  CheckoutValidationError,
  startCheckout
} from "../../../../checkout/checkout-service";

export async function POST(request: Request) {
  const session = await currentCustomerSession();
  if (!session) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  try {
    const body = await request.json() as {
      productId?: string;
      phone?: string;
      fulfillmentMethod?: string;
      deliveryAddress?: string;
      deliveryNote?: string;
    };
    const productId = body.productId?.trim();
    if (!productId) throw new CheckoutValidationError("Product is required.");
    if (!body.phone?.trim()) throw new CheckoutValidationError("M-Pesa phone is required.");

    const fulfillmentMethod = body.fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY
      ? FulfillmentMethod.KIKUYU_LOCAL_DELIVERY
      : FulfillmentMethod.PICKUP;

    const result = await startCheckout({
      customerId: session.customerId,
      productId,
      phone: body.phone,
      fulfillmentMethod,
      deliveryAddress: body.deliveryAddress,
      deliveryNote: body.deliveryNote
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CheckoutConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("checkout_start_failed", error);
    return NextResponse.json({ error: "Unable to start checkout." }, { status: 500 });
  }
}
