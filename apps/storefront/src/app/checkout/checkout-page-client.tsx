"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  MessageCircle,
  Navigation,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  Smartphone,
  Truck
} from "lucide-react";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { KIKUYU_DELIVERY_FEE_KSH } from "@online-saler/business-rules";
import {
  deliveryRequiresAddress,
  googleMapsConfigured,
  type FulfillmentChoice
} from "../cart-checkout-ui";
import {
  CART_STORAGE_KEY,
  cartProductIds,
  notifyCartUpdated,
  parseCartSnapshot,
  removeCartItem,
  type CartSnapshot
} from "../storefront-cart";
import type { CartValidationResponse, ValidatedCartItem } from "../../cart/cart-validation-types";
import { moneyKsh } from "../storefront-products";
import { canRetryPayment, paymentBody, paymentFailed, paymentHeading, paymentSucceeded, paymentTone } from "../../payments/payment-ui";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";

type CheckoutState = "loading" | "empty" | "ready" | "error";
type Reservation = {
  orderId: string;
  orderNumber: string;
  draftId: string;
  phone: string;
  expiresAt: string;
  reservationMinutes: number;
  itemSubtotalKsh: number;
  deliveryFeeKsh: number;
  totalKsh: number;
  currency: "KES";
};
type PaymentState = {
  paymentId: string | null;
  orderId: string;
  orderNumber: string;
  orderStatus?: string;
  status?: string;
  paymentStatus?: string | null;
  amountKsh: number;
  phone: string | null;
  expiresAt: string | null;
  checkoutRequestId?: string | null;
  merchantRequestId?: string | null;
  customerMessage?: string | null;
  receiptNumber?: string | null;
  resultDescription?: string | null;
};
type CheckoutDraft = {
  phone: string;
  fulfillment: FulfillmentChoice;
  deliveryAddress: string;
  deliveryNote: string;
};

const GOOGLE_MAPS_SCRIPT_ID = "direct-loop-google-maps-places";
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const CHECKOUT_DRAFT_STORAGE_KEY = "online-saler-checkout-draft-v1";

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      places?: {
        Autocomplete: new (
          input: HTMLInputElement,
          options: Record<string, unknown>
        ) => {
          addListener: (eventName: string, handler: () => void) => { remove?: () => void };
          getPlace: () => {
            formatted_address?: string;
            name?: string;
            place_id?: string;
            geometry?: {
              location?: {
                lat: () => number;
                lng: () => number;
              };
            };
          };
        };
      };
    };
  };
  __directLoopGoogleMapsPromise?: Promise<void>;
};

export function CheckoutPageClient() {
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [validation, setValidation] = useState<CartValidationResponse | null>(null);
  const [state, setState] = useState<CheckoutState>("loading");
  const [fulfillment, setFulfillment] = useState<FulfillmentChoice>("PICKUP");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [refreshingPayment, setRefreshingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [reservedCartIds, setReservedCartIds] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const reservedCartIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const draft = readCheckoutDraft();
    if (draft) {
      setPhone(draft.phone);
      setFulfillment(draft.fulfillment);
      setDeliveryAddress(draft.deliveryAddress);
      setDeliveryNote(draft.deliveryNote);
    }
    void loadAndValidate();
  }, []);

  useEffect(() => {
    if (reservation) return;
    writeCheckoutDraft({ phone, fulfillment, deliveryAddress, deliveryNote });
  }, [deliveryAddress, deliveryNote, fulfillment, phone, reservation]);

  useEffect(() => {
    function handleFocus() {
      if (!reservation) void loadAndValidate(false);
    }
    const timer = window.setInterval(() => {
      if (!reservation) void loadAndValidate(false);
    }, 45_000);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [reservation]);

  useEffect(() => {
    if (!reservation) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [reservation]);

  useEffect(() => {
    if (!reservation || !payment?.paymentId) return;
    const currentStatus = payment.paymentStatus ?? payment.status;
    if (currentStatus && currentStatus !== "PENDING") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/payments/mpesa/status?orderId=${encodeURIComponent(reservation.orderId)}`, {
          cache: "no-store"
        });
        if (!response.ok) return;
        applyPaymentStatus(await response.json() as PaymentState);
      } catch {
        // Polling is advisory; the customer can manually refresh if the network drops.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [payment, reservation]);

  const checkoutableItems = useMemo(() => validation?.items.filter((item) => item.canCheckout) ?? [], [validation]);
  const unavailableItems = useMemo(() => validation?.items.filter((item) => !item.canCheckout) ?? [], [validation]);
  const secondsRemaining = useMemo(() => {
    if (!reservation) return 0;
    return Math.max(0, Math.ceil((new Date(reservation.expiresAt).getTime() - now) / 1000));
  }, [now, reservation]);

  async function loadAndValidate(showLoading = true): Promise<CartValidationResponse | null> {
    const nextSnapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
    setSnapshot(nextSnapshot);
    if (!nextSnapshot?.items.length) {
      setValidation(null);
      setState("empty");
      return null;
    }
    if (showLoading) setState("loading");
    try {
      const nextValidation = await validateCart(cartProductIds(nextSnapshot));
      setValidation(nextValidation);
      setState("ready");
      return nextValidation;
    } catch {
      setState("error");
      return null;
    }
  }

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || reservation) return;
    setSubmitting(true);
    setError("");
    try {
      const freshValidation = await loadAndValidate(false);
      const payableItems = freshValidation?.items.filter((item) => item.canCheckout && item.productId) ?? [];
      if (!payableItems.length) throw new Error("No available cart items can be paid for.");
      if ((freshValidation?.summary.unavailableCount ?? 0) > 0) {
        throw new Error("Remove unavailable items or continue with only available items after reviewing the cart.");
      }
      const response = await fetch("/api/checkout/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productIds: payableItems.map((item) => item.requestedProductId),
          phone,
          fulfillmentMethod: fulfillment,
          deliveryAddress: deliveryRequiresAddress(fulfillment) ? deliveryAddress : null,
          deliveryNote: deliveryNote || null
        })
      });
      const result = await response.json().catch(() => ({})) as Reservation & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to reserve these items.");
      const nextReservedCartIds = payableItems.map((item) => item.requestedProductId);
      reservedCartIdsRef.current = nextReservedCartIds;
      setReservedCartIds(nextReservedCartIds);
      setReservation(result);
      setNow(Date.now());
      await initiatePayment(result.orderId);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to reserve these items.");
    } finally {
      setSubmitting(false);
    }
  }

  async function initiatePayment(orderId: string) {
    setPaymentLoading(true);
    setPaymentError("");
    try {
      const response = await fetch("/api/payments/mpesa/initiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      const result = await response.json().catch(() => ({})) as PaymentState & { error?: string };
      if (!response.ok) throw new Error(result.error || "M-Pesa request could not be started.");
      applyPaymentStatus(result);
    } catch (paymentStartError) {
      setPaymentError(paymentStartError instanceof Error ? paymentStartError.message : "M-Pesa request could not be started.");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function refreshPaymentStatus() {
    if (!reservation || refreshingPayment) return;
    setRefreshingPayment(true);
    setPaymentError("");
    try {
      const response = await fetch(`/api/payments/mpesa/status?orderId=${encodeURIComponent(reservation.orderId)}`, {
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({})) as PaymentState & { error?: string };
      if (!response.ok) throw new Error(result.error || "Payment status could not be refreshed.");
      applyPaymentStatus(result);
    } catch (refreshError) {
      setPaymentError(refreshError instanceof Error ? refreshError.message : "Payment status could not be refreshed.");
    } finally {
      setRefreshingPayment(false);
    }
  }

  function applyPaymentStatus(nextPayment: PaymentState) {
    setPayment(nextPayment);
    if (paymentSucceeded(nextPayment.orderStatus, nextPayment.paymentStatus ?? nextPayment.status)) {
      removePurchasedCartItems(reservedCartIdsRef.current.length ? reservedCartIdsRef.current : reservedCartIds);
      window.localStorage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
    }
  }

  function removePurchasedCartItems(productIds: string[]) {
    let nextSnapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
    for (const productId of productIds) {
      nextSnapshot = removeCartItem(nextSnapshot, productId);
    }
    if (!nextSnapshot?.items.length) window.localStorage.removeItem(CART_STORAGE_KEY);
    else window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextSnapshot));
    notifyCartUpdated();
  }

  if (state === "loading") {
    return <CheckoutEmpty title="Checkout" body="Checking your cart before payment..." />;
  }

  if (state === "empty") {
    return (
      <CheckoutEmpty
        title="Your cart is empty"
        body="Choose available items before starting checkout."
        action={<Link className="commercePrimaryButton" href="/">Browse items <ArrowRight size={16} /></Link>}
      />
    );
  }

  if (state === "error" || !validation) {
    return (
      <CheckoutEmpty
        title="Checkout could not refresh"
        body="We could not check current stock. Refresh the cart before payment."
        action={<button className="commerceSecondaryButton" type="button" onClick={() => loadAndValidate()}>Refresh checkout</button>}
      />
    );
  }

  const hasCheckoutableItems = checkoutableItems.length > 0;
  const requiresAddress = deliveryRequiresAddress(fulfillment);
  const itemTotal = reservation?.itemSubtotalKsh ?? validation.summary.itemSubtotalKsh;
  const deliveryFee = reservation?.deliveryFeeKsh ?? (fulfillment === "KIKUYU_LOCAL_DELIVERY" ? KIKUYU_DELIVERY_FEE_KSH : 0);
  const total = reservation?.totalKsh ?? itemTotal + deliveryFee;
  const itemTotalLabel = hasCheckoutableItems ? moneyKsh(itemTotal) : "Not available";
  const deliveryFeeLabel = requiresAddress ? moneyKsh(deliveryFee) : "Free";
  const totalLabel = hasCheckoutableItems ? moneyKsh(total) : "Not ready";
  const minutes = Math.floor(secondsRemaining / 60).toString().padStart(2, "0");
  const seconds = (secondsRemaining % 60).toString().padStart(2, "0");
  const paymentStatus = payment?.paymentStatus ?? payment?.status ?? null;
  const isPaymentSucceeded = paymentSucceeded(payment?.orderStatus, paymentStatus);
  const isPaymentFailed = paymentFailed(paymentStatus);
  const isPaymentRetryable = canRetryPayment(paymentStatus, secondsRemaining);
  if (reservation && isPaymentSucceeded) {
    return (
      <section className="commerceCheckoutShell checkoutSuccessShell" aria-label="Payment confirmation">
        <PaymentPanel
          fulfillment={fulfillment}
          isPaymentFailed={isPaymentFailed}
          isPaymentRetryable={isPaymentRetryable}
          isPaymentSucceeded={isPaymentSucceeded}
          payment={payment}
          paymentError={paymentError}
          paymentLoading={paymentLoading}
          refreshPaymentStatus={refreshPaymentStatus}
          refreshingPayment={refreshingPayment}
          reservation={reservation}
          retryPayment={() => initiatePayment(reservation.orderId)}
          secondsRemaining={secondsRemaining}
          timerLabel={secondsRemaining > 0 ? `${minutes}:${seconds}` : "Expired"}
        />
      </section>
    );
  }

  return (
    <section className="commerceCheckoutShell" aria-label="Checkout">
      <div className="checkoutHero">
        <h1>{reservation ? "Complete payment" : "Checkout"}</h1>
      </div>

      <div className="commerceCheckoutGrid">
        <div className="checkoutStack">
          <section className="checkoutPanel">
            <h2>{reservation ? "M-Pesa request" : "Contact and handoff details"}</h2>

            {reservation ? (
              <PaymentPanel
                fulfillment={fulfillment}
                isPaymentFailed={isPaymentFailed}
                isPaymentRetryable={isPaymentRetryable}
                isPaymentSucceeded={isPaymentSucceeded}
                payment={payment}
                paymentError={paymentError}
                paymentLoading={paymentLoading}
                refreshPaymentStatus={refreshPaymentStatus}
                refreshingPayment={refreshingPayment}
                reservation={reservation}
                retryPayment={() => initiatePayment(reservation.orderId)}
                secondsRemaining={secondsRemaining}
                timerLabel={secondsRemaining > 0 ? `${minutes}:${seconds}` : "Expired"}
              />
            ) : (
              <form className="checkoutForm" onSubmit={submitCheckout}>
                <CheckoutItemsPreview items={validation.items} />
                {unavailableItems.length ? (
                  <p className="checkoutError" role="alert">Some cart items cannot be paid for. Return to cart to remove them before payment.</p>
                ) : null}
                <label className="checkoutField">
                  <span>M-Pesa phone</span>
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    name="phone"
                    placeholder="07..."
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </label>

                <div className="commerceOptionGrid" role="radiogroup" aria-label="Fulfillment">
                  <label className={`commerceOption ${fulfillment === "PICKUP" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="fulfillment"
                      value="PICKUP"
                      checked={fulfillment === "PICKUP"}
                      onChange={() => setFulfillment("PICKUP")}
                    />
                    <PackageCheck size={20} />
                    <div>
                      <span>Free</span>
                      <strong>Kikuyu pickup</strong>
                    </div>
                  </label>
                  <label className={`commerceOption ${fulfillment === "KIKUYU_LOCAL_DELIVERY" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="fulfillment"
                      value="KIKUYU_LOCAL_DELIVERY"
                      checked={fulfillment === "KIKUYU_LOCAL_DELIVERY"}
                      onChange={() => setFulfillment("KIKUYU_LOCAL_DELIVERY")}
                    />
                    <Truck size={20} />
                    <div>
                      <span>{moneyKsh(KIKUYU_DELIVERY_FEE_KSH)}</span>
                      <strong>Kikuyu local delivery</strong>
                    </div>
                  </label>
                </div>

                {requiresAddress ? (
                  <GoogleAddressField
                    value={deliveryAddress}
                    onChange={setDeliveryAddress}
                    disabled={submitting}
                  />
                ) : null}

                <label className="checkoutField">
                  <span>{fulfillment === "PICKUP" ? "Pickup note for customer service" : "Delivery note for customer service"}</span>
                  <textarea
                    name="deliveryNote"
                    placeholder="Preferred time, nearby shop, gate colour, WhatsApp note, or anything the team should know"
                    value={deliveryNote}
                    onChange={(event) => setDeliveryNote(event.target.value)}
                  />
                </label>

                {error ? <p className="checkoutError" role="alert">{error}</p> : null}
                <button className="commercePrimaryButton full" type="submit" disabled={submitting || !checkoutableItems.length || Boolean(unavailableItems.length)}>
                  <CreditCard size={17} /> {submitting ? "Checking stock..." : `Pay ${totalLabel} with M-Pesa`}
                </button>
              </form>
            )}
          </section>
        </div>

        <aside className="checkoutSummaryPanel">
          <h2>Order summary</h2>
          <div className="commerceSummaryRows">
            <div className="commerceSummaryRow"><span>Items</span><strong>{itemTotalLabel}</strong></div>
            <div className="commerceSummaryRow"><span>{requiresAddress ? "Delivery" : "Pickup"}</span><strong>{deliveryFeeLabel}</strong></div>
            <div className="commerceSummaryRow total"><span>Total</span><strong>{totalLabel}</strong></div>
          </div>
        </aside>
      </div>
    </section>
  );
}

async function validateCart(productIds: string[]): Promise<CartValidationResponse> {
  const response = await fetch("/api/cart/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productIds }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Cart validation failed.");
  return response.json() as Promise<CartValidationResponse>;
}

function PaymentPanel({
  fulfillment,
  isPaymentFailed,
  isPaymentRetryable,
  isPaymentSucceeded,
  payment,
  paymentError,
  paymentLoading,
  refreshPaymentStatus,
  refreshingPayment,
  reservation,
  retryPayment,
  secondsRemaining,
  timerLabel
}: {
  fulfillment: FulfillmentChoice;
  isPaymentFailed: boolean;
  isPaymentRetryable: boolean;
  isPaymentSucceeded: boolean;
  payment: PaymentState | null;
  paymentError: string;
  paymentLoading: boolean;
  refreshPaymentStatus: () => void;
  refreshingPayment: boolean;
  reservation: Reservation;
  retryPayment: () => void;
  secondsRemaining: number;
  timerLabel: string;
}) {
  const { t } = useStorefrontI18n();
  const paymentStatus = payment?.paymentStatus ?? payment?.status ?? null;
  const tone = paymentTone({
    orderStatus: payment?.orderStatus,
    paymentStatus,
    paymentLoading
  });
  const timerDisplay = isPaymentSucceeded ? "Paid" : secondsRemaining > 0 ? timerLabel : "Expired";
  const timerCopy = isPaymentSucceeded
    ? "payment confirmed"
    : secondsRemaining > 0
      ? "remaining to complete payment"
      : "stock has been released";
  const paymentIcon = tone === "success"
    ? <CheckCircle2 size={22} />
    : tone === "failed" || tone === "expired"
      ? <AlertCircle size={22} />
      : tone === "review"
        ? <ReceiptText size={22} />
        : <Smartphone size={22} />;

  if (isPaymentSucceeded) {
    const isPickup = fulfillment === "PICKUP";
    const whatsappUrl = `https://wa.me/254742001507?text=${encodeURIComponent(`Hello Direct Loop, I need help with order ${reservation.orderNumber}.`)}`;
    return (
      <div className="paymentSuccessPanel" role="status">
        <div className="paymentSuccessMark"><CheckCircle2 size={36} aria-hidden="true" /></div>
        <div className="paymentSuccessHeading">
          <h1>{t("payment.confirmed")}</h1>
          <p>{t("payment.nextBody")}</p>
        </div>

        <dl className="paymentSuccessFacts">
          <div><dt>Order</dt><dd>{reservation.orderNumber}</dd></div>
          <div><dt>Paid</dt><dd>{moneyKsh(reservation.totalKsh)}</dd></div>
          <div><dt>M-Pesa receipt</dt><dd>{payment?.receiptNumber ?? "Confirmed"}</dd></div>
        </dl>

        <section className="paymentNextStep">
          <PackageCheck size={24} aria-hidden="true" />
          <div>
            <h2>{t("payment.nextTitle")}</h2>
            <p>
              {isPickup
                ? `${t("payment.nextBody")} ${t("payment.keepPhone", { phone: `+${reservation.phone}` })}`
                : `${t("payment.nextBody")} ${t("payment.keepPhone", { phone: `+${reservation.phone}` })}`}
            </p>
          </div>
        </section>

        <section className="paymentSupportRow">
          <MessageCircle size={22} aria-hidden="true" />
          <div>
            <h2>Direct Loop customer service</h2>
            <p>WhatsApp 0742 001 507 if you need help with this order.</p>
          </div>
          <a className="commerceSecondaryButton" href={whatsappUrl} target="_blank" rel="noreferrer">Contact us</a>
        </section>

        <div className="paymentSuccessActions">
          <Link className="commercePrimaryButton" href={`/orders/${encodeURIComponent(reservation.orderNumber)}`}>
            {t("payment.viewOrder")} <ArrowRight size={16} />
          </Link>
          <Link className="commerceTextButton" href="/">{t("cart.continueShopping")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`reservationCard ${tone}`} role="status">
      <div className="reservationTimer">
        <div>
          <strong>{timerDisplay}</strong>
          <span>{timerCopy}</span>
        </div>
        <Clock3 size={26} />
      </div>

      <div className="paymentReviewGrid">
        <div><span>Order</span><strong>{reservation.orderNumber}</strong></div>
        <div><span>Total</span><strong>{moneyKsh(reservation.totalKsh)}</strong></div>
        <div><span>M-Pesa phone</span><strong>+{reservation.phone}</strong></div>
      </div>

      <div className={`paymentStatusCard ${tone}`}>
        <div className="paymentStatusIcon">{paymentIcon}</div>
        <div>
          <b>
            {paymentHeading({
              orderStatus: payment?.orderStatus,
              paymentStatus,
              paymentLoading
            })}
          </b>
          <span>
            {paymentBody({
              orderStatus: payment?.orderStatus,
              paymentStatus,
              receiptNumber: payment?.receiptNumber,
              paymentError,
              customerMessage: payment?.customerMessage,
              resultDescription: payment?.resultDescription
            })}
          </span>
        </div>
      </div>

      {!isPaymentSucceeded ? (
        <div className="mpesaInstructionCard">
          <Smartphone size={18} />
          <div>
            <strong>Check your phone</strong>
            <span>Safaricom will show a payment prompt. Enter your M-Pesa PIN before the timer expires.</span>
          </div>
        </div>
      ) : null}

      <div className="paymentTimeline" aria-label="Payment progress">
        <div className="done"><CheckCircle2 size={16} /><span>Stock locked</span></div>
        <div className={isPaymentSucceeded ? "done" : isPaymentFailed ? "failed" : "current"}>
          {isPaymentFailed ? <AlertCircle size={16} /> : isPaymentSucceeded ? <CheckCircle2 size={16} /> : <Smartphone size={16} />}
          <span>M-Pesa confirmation</span>
        </div>
        <div className="pending"><MessageCircle size={16} /><span>Staff handoff call</span></div>
      </div>
      <div className="checkoutPaymentActions">
        <button className="commerceSecondaryButton" type="button" disabled={refreshingPayment} onClick={refreshPaymentStatus}>
          <RefreshCw size={16} /> {refreshingPayment ? "Refreshing..." : "Refresh status"}
        </button>
      </div>
      {paymentError || isPaymentRetryable ? (
        <button className="commerceSecondaryButton full" type="button" disabled={paymentLoading || secondsRemaining <= 0} onClick={retryPayment}>
          <Smartphone size={16} /> {paymentLoading ? "Retrying..." : "Retry M-Pesa"}
        </button>
      ) : null}
    </div>
  );
}

function CheckoutItemsPreview({ items }: { items: ValidatedCartItem[] }) {
  return (
    <div className="checkoutItemsPreview">
      {items.map((item) => (
        <div key={item.requestedProductId} className={`checkoutItemPreview ${item.canCheckout ? "" : "blocked"}`}>
          <div className="summaryProductImage">{item.storefrontImage ? <img src={item.storefrontImage} alt="" /> : null}</div>
          <div>
            <strong>{item.title}</strong>
            <span>{[item.productCode, item.size, item.condition].filter(Boolean).join(" / ")}</span>
            {!item.canCheckout ? <small>{item.statusMessage}</small> : null}
          </div>
          <b>{moneyKsh(item.priceKsh)}</b>
        </div>
      ))}
    </div>
  );
}

function CheckoutEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <section className="checkoutEmptyState">
      <h1>{title}</h1>
      <p>{body}</p>
      {action}
    </section>
  );
}

function readCheckoutDraft(): CheckoutDraft | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHECKOUT_DRAFT_STORAGE_KEY) ?? "null") as CheckoutDraft | null;
    if (!parsed) return null;
    return {
      phone: parsed.phone ?? "",
      fulfillment: parsed.fulfillment === "KIKUYU_LOCAL_DELIVERY" ? "KIKUYU_LOCAL_DELIVERY" : "PICKUP",
      deliveryAddress: parsed.deliveryAddress ?? "",
      deliveryNote: parsed.deliveryNote ?? ""
    };
  } catch {
    return null;
  }
}

function writeCheckoutDraft(draft: CheckoutDraft) {
  window.localStorage.setItem(CHECKOUT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function GoogleAddressField({
  value,
  onChange,
  disabled
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mapsState, setMapsState] = useState<"manual" | "loading" | "ready">(
    googleMapsConfigured(GOOGLE_MAPS_API_KEY) ? "loading" : "manual"
  );
  const [placeDetails, setPlaceDetails] = useState<{ name: string; address: string; placeId?: string } | null>(null);

  useEffect(() => {
    const apiKey = GOOGLE_MAPS_API_KEY;
    if (!apiKey || !inputRef.current) {
      setMapsState("manual");
      return;
    }

    let listener: { remove?: () => void } | null = null;
    let disposed = false;
    setMapsState("loading");

    loadGoogleMaps(apiKey)
      .then(() => {
        if (disposed || !inputRef.current) return;
        const mapsWindow = window as GoogleMapsWindow;
        const Autocomplete = mapsWindow.google?.maps?.places?.Autocomplete;
        if (!Autocomplete) {
          setMapsState("manual");
          return;
        }
        const autocomplete = new Autocomplete(inputRef.current, {
          componentRestrictions: { country: "ke" },
          fields: ["formatted_address", "geometry", "name", "place_id"]
        });
        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const nextAddress = place.formatted_address ?? place.name ?? inputRef.current?.value ?? "";
          onChange(nextAddress);
          setPlaceDetails({
            name: place.name ?? "Selected delivery place",
            address: nextAddress,
            placeId: place.place_id
          });
        });
        setMapsState("ready");
      })
      .catch(() => setMapsState("manual"));

    return () => {
      disposed = true;
      listener?.remove?.();
    };
  }, [onChange]);

  return (
    <div className="deliveryAddressBox">
      <label className="checkoutField">
        <span>Delivery landmark or address</span>
        <input
          ref={inputRef}
          autoComplete="street-address"
          disabled={disabled}
          name="deliveryAddress"
          placeholder="Estate, road, shop, gate, or nearby landmark in Kikuyu"
          required
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setPlaceDetails(null);
          }}
        />
      </label>
      <div className={`deliveryMapStatus ${mapsState === "ready" ? "ready" : ""}`}>
        <Navigation size={16} />
        <span>
          {mapsState === "ready"
            ? "Google address suggestions are ready. Choose one or keep typing your landmark."
            : mapsState === "loading"
              ? "Loading Google address suggestions..."
              : "You can type a landmark manually. Customer service will confirm it after payment."}
        </span>
      </div>
      {placeDetails ? (
        <div className="deliveryPlacePreview">
          <strong>{placeDetails.name}</strong>
          <span>{placeDetails.address}</span>
        </div>
      ) : null}
      <p className="deliveryMapHint">No exact pin is required now. Delivery is limited to Kikuyu local area and arranged by customer service after payment.</p>
    </div>
  );
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  const mapsWindow = window as GoogleMapsWindow;
  if (mapsWindow.google?.maps?.places) return Promise.resolve();
  if (mapsWindow.__directLoopGoogleMapsPromise) return mapsWindow.__directLoopGoogleMapsPromise;

  mapsWindow.__directLoopGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });

  return mapsWindow.__directLoopGoogleMapsPromise;
}
