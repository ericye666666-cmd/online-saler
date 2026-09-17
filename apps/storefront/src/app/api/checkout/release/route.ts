import { NextResponse } from "next/server";
import { checkoutViewers } from "../../../../auth/checkout-identity";
import {
  CheckoutValidationError,
  releaseCustomerCheckoutReservations
} from "../../../../checkout/checkout-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Guests hold reservations too, and they must be able to let them go.
  const viewers = await checkoutViewers();
  if (!viewers.length) return NextResponse.json({ cancelledOrders: 0, releasedItems: 0 }, { headers: { "cache-control": "no-store" } });

  try {
    const body = await request.json() as { productIds?: unknown };
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((productId) => typeof productId === "string")
      : [];
    // Reservations may sit on the guest record even after the shopper signs in,
    // so release across every identity this browser holds.
    let cancelledOrders = 0;
    let releasedItems = 0;
    for (const viewer of viewers) {
      const result = await releaseCustomerCheckoutReservations(viewer.customerId, productIds);
      cancelledOrders += result.cancelledOrders;
      releasedItems += result.releasedItems;
    }
    return NextResponse.json({ cancelledOrders, releasedItems }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("checkout_release_failed", error);
    return NextResponse.json({ error: "Payment lock could not be released. Please try again." }, { status: 500 });
  }
}
