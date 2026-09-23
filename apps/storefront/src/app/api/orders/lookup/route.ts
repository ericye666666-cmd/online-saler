import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GUEST_CHECKOUT_COOKIE,
  guestCheckoutToken,
  guestCookieOptions,
  parseGuestCheckout,
  rememberGuestOrder
} from "../../../../auth/guest-checkout";
import {
  OrderLookupError,
  OrderLookupThrottledError,
  lookupOrder
} from "../../../../orders/order-lookup";

export const dynamic = "force-dynamic";

/**
 * "I lost my order." A matching phone number and order number re-attach the
 * order to this device, which is what the order page and the balance payment
 * both check. Proving ownership is the whole point: after this the caller can
 * pay money against the order, so the check is the same strength as the one
 * checkout itself relies on.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { phone?: string; orderNumber?: string };
    const result = await lookupOrder({
      phone: body.phone ?? "",
      orderNumber: body.orderNumber ?? "",
      // Cloud Run puts the client address first in this header.
      caller: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip")
    });

    const cookieStore = await cookies();
    const guest = parseGuestCheckout(cookieStore.get(GUEST_CHECKOUT_COOKIE)?.value);
    const response = NextResponse.json(
      { orderNumber: result.orderNumber },
      { headers: { "cache-control": "no-store" } }
    );
    response.cookies.set(
      GUEST_CHECKOUT_COOKIE,
      guestCheckoutToken(rememberGuestOrder(guest, result.customerId, result.normalizedPhone, result.orderId)),
      guestCookieOptions
    );
    return response;
  } catch (error) {
    if (error instanceof OrderLookupThrottledError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof OrderLookupError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("order_lookup_failed", error);
    return NextResponse.json({ error: "Order lookup could not run. Please try again." }, { status: 500 });
  }
}
