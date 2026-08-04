import { NextResponse } from "next/server";
import { currentCustomerSession } from "../../../../auth/customer-auth";
import {
  CheckoutValidationError,
  releaseCustomerCheckoutReservations
} from "../../../../checkout/checkout-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await currentCustomerSession();
  if (!session) return NextResponse.json({ error: "Sign in before releasing a payment lock." }, { status: 401 });

  try {
    const body = await request.json() as { productIds?: unknown };
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((productId) => typeof productId === "string")
      : [];
    const result = await releaseCustomerCheckoutReservations(session.customerId, productIds);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("checkout_release_failed", error);
    return NextResponse.json({ error: "Payment lock could not be released. Please try again." }, { status: 500 });
  }
}
