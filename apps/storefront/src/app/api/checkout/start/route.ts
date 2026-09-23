import { FulfillmentMethod, OrderPaymentPlan } from "@online-saler/database";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AFFILIATE_ATTRIBUTION_COOKIE,
  parseAffiliateCookie
} from "../../../../affiliate/affiliate-service";
import { currentCustomerSession } from "../../../../auth/customer-auth";
import {
  GUEST_CHECKOUT_COOKIE,
  findOrCreateGuestCustomer,
  guestCheckoutToken,
  guestCookieOptions,
  parseGuestCheckout,
  rememberGuestOrder
} from "../../../../auth/guest-checkout";
import {
  CheckoutConflictError,
  CheckoutValidationError,
  normalizeKenyaPhone,
  startCheckout
} from "../../../../checkout/checkout-service";

export async function POST(request: Request) {
  // No sign-in gate. The M-Pesa phone identifies the shopper, and the STK PIN
  // they enter on that handset is the proof of ownership.
  const session = await currentCustomerSession();

  try {
    const body = await request.json() as {
      productIds?: string[];
      phone?: string;
      fulfillmentMethod?: string;
      deliveryAddress?: string | null;
      deliveryNote?: string | null;
      fulfillmentNodeId?: string | null;
      whatsappPhone?: string | null;
      paymentPlan?: string | null;
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
    // Absent means pay in full, so an older client that knows nothing about
    // deposits keeps checking out exactly as it did.
    const paymentPlan = body.paymentPlan ?? OrderPaymentPlan.FULL;
    if (!Object.values(OrderPaymentPlan).includes(paymentPlan as OrderPaymentPlan)) {
      throw new CheckoutValidationError("Choose to pay in full or to pay a 50% deposit.");
    }

    const normalizedPhone = normalizeKenyaPhone(phone);
    const cookieStore = await cookies();
    const guest = session ? null : parseGuestCheckout(cookieStore.get(GUEST_CHECKOUT_COOKIE)?.value);
    const customerId = session
      ? session.customerId
      : (await findOrCreateGuestCustomer(normalizedPhone)).id;

    const attribution = parseAffiliateCookie(cookieStore.get(AFFILIATE_ATTRIBUTION_COOKIE)?.value);
    const result = await startCheckout({
      customerId,
      productIds,
      phone: normalizedPhone,
      fulfillmentMethod: body.fulfillmentMethod as FulfillmentMethod,
      deliveryAddress: body.deliveryAddress,
      deliveryNote: body.deliveryNote,
      fulfillmentNodeId: body.fulfillmentNodeId,
      whatsappPhone: body.whatsappPhone,
      paymentPlan: paymentPlan as OrderPaymentPlan,
      attribution
    });

    const response = NextResponse.json(result, {
      status: 201,
      headers: { "cache-control": "no-store" }
    });
    if (!session) {
      // Bind this order to the device so payment status and the order page stay
      // reachable without an account.
      const nextGuest = rememberGuestOrder(guest, customerId, normalizedPhone, result.orderId);
      response.cookies.set(GUEST_CHECKOUT_COOKIE, guestCheckoutToken(nextGuest), guestCookieOptions);
    }
    return response;
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
