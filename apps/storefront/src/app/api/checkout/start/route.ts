import { FulfillmentMethod } from "@online-saler/database";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AFFILIATE_ATTRIBUTION_COOKIE,
  parseAffiliateCookie
} from "../../../../affiliate/affiliate-service";
import { currentCustomerSession } from "../../../../auth/customer-auth";
import {
  CheckoutConflictError,
  CheckoutValidationError,
  startCheckout
} from "../../../../checkout/checkout-service";

export async function POST(request: Request) {
  const session = await currentCustomerSession();
  if (!session) return NextResponse.json({ error: "Sign in with Google before checkout." }, { status: 401 });

  try {
    const body = await request.json() as {
      productIds?: string[];
      phone?: string;
      fulfillmentMethod?: string;
      deliveryAddress?: string | null;
      deliveryNote?: string | null;
    };
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((productId) => typeof productId === "string").map((productId) => productId.trim()).filter(Boolean)
      : [];
    const phone = body.phone?.trim();
    if (!productIds.length || !phone) {
      throw new CheckoutValidationError("Cart items and M-Pesa phone are required.");
    }
    if (!Object.values(FulfillmentMethod).includes(body.fulfillmentMethod as FulfillmentMethod)) {
      throw new CheckoutValidationError("Choose Kikuyu pickup or local delivery.");
    }

    const cookieStore = await cookies();
    const attribution = parseAffiliateCookie(cookieStore.get(AFFILIATE_ATTRIBUTION_COOKIE)?.value);
    const result = await startCheckout({
      customerId: session.customerId,
      productIds,
      phone,
      fulfillmentMethod: body.fulfillmentMethod as FulfillmentMethod,
      deliveryAddress: body.deliveryAddress,
      deliveryNote: body.deliveryNote,
      attribution
    });
    return NextResponse.json(result, {
      status: 201,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CheckoutConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("checkout_start_failed", error);
    return NextResponse.json({ error: "Checkout could not be started. Please try again." }, { status: 500 });
  }
}
