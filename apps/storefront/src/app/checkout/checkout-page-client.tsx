"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  MapPin,
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
  checkoutStage,
  checkoutStepStatus,
  deliveryRequiresAddress,
  googleMapsConfigured,
  type CheckoutStage,
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
  const currentStage = checkoutStage(Boolean(reservation), isPaymentSucceeded);

  return (
    <section className="commerceCheckoutShell" aria-label="Checkout">
      <div className="checkoutHero">
        <div>
          <span className="checkoutKicker">Checkout</span>
          <h1>{reservation ? "Complete payment" : "Review your order"}</h1>
          <p className="checkoutLead">
            {reservation
              ? `Order ${reservation.orderNumber} is reserved while you complete M-Pesa.`
              : "Confirm the items, choose pickup or Kikuyu delivery, then pay with M-Pesa."}
          </p>
        </div>
        <CheckoutProgress stage={currentStage} />
      </div>

      <div className="commerceCheckoutGrid">
        <div className="checkoutStack">
          <section className="checkoutPanel">
            <h2>{reservation ? "M-Pesa request" : "Contact and handoff details"}</h2>

            {reservation ? (
              <PaymentPanel
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
                <div className="checkoutServiceStrip" aria-label="Checkout handoff steps">
                  <div>
                    <span>01</span>
                    <strong>M-Pesa phone</strong>
                    <p>We send the payment prompt to this number.</p>
                  </div>
                  <div>
                    <span>02</span>
                    <strong>Choose handoff</strong>
                    <p>Pickup is free. Kikuyu delivery is {moneyKsh(KIKUYU_DELIVERY_FEE_KSH)}.</p>
                  </div>
                  <div>
                    <span>03</span>
                    <strong>Staff confirms</strong>
                    <p>After payment, our team calls or WhatsApps you.</p>
                  </div>
                </div>
                <CheckoutItemsPreview items={validation.items} />
                {unavailableItems.length ? (
                  <p className="checkoutError" role="alert">Some cart items cannot be paid for. Return to cart to remove them before payment.</p>
                ) : null}
                <label className="checkoutField">
                  <span>M-Pesa phone for payment and handoff</span>
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    name="phone"
                    placeholder="07..."
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                  <small>The M-Pesa prompt is sent here, and customer service uses the same number to confirm pickup or delivery.</small>
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
                      <p>Our team prepares the order and confirms the pickup time after payment.</p>
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
                      <p>Share an estate, road, shop, gate, or landmark. We confirm the exact spot by phone.</p>
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

                <div className="checkoutSupportNotice">
                  <Smartphone size={17} />
                  <div>
                    <strong>Customer service arranges the final handoff</strong>
                    <p>Keep your phone reachable after payment. We will confirm pickup or local delivery before the order moves out.</p>
                  </div>
                </div>

                {error ? <p className="checkoutError" role="alert">{error}</p> : null}
                <button className="commercePrimaryButton full" type="submit" disabled={submitting || !checkoutableItems.length || Boolean(unavailableItems.length)}>
                  <CreditCard size={17} /> {submitting ? "Checking stock..." : "Pay with M-Pesa"}
                </button>
              </form>
            )}
          </section>

          <section className="commerceFeatureGrid" aria-label="Checkout safeguards">
            <div className="commerceFeature">
              <Clock3 size={18} />
              <div><strong>15 minute lock</strong><span>All items are locked together only at payment.</span></div>
            </div>
            <div className="commerceFeature">
              <CheckCircle2 size={18} />
              <div><strong>Live check</strong><span>The server checks price and availability again.</span></div>
            </div>
            <div className="commerceFeature">
              <MapPin size={18} />
              <div><strong>Customer service handoff</strong><span>Pickup or local delivery is confirmed by staff after payment.</span></div>
            </div>
          </section>
        </div>

        <aside className="checkoutSummaryPanel">
          <h2>Order summary</h2>
          <SummaryItems items={checkoutableItems} />
          <div className="commerceSummaryRows">
            <div className="commerceSummaryRow"><span>Items</span><strong>{itemTotalLabel}</strong></div>
            <div className="commerceSummaryRow"><span>{requiresAddress ? "Delivery" : "Pickup"}</span><strong>{deliveryFeeLabel}</strong></div>
            <div className="commerceSummaryRow total"><span>Total</span><strong>{totalLabel}</strong></div>
          </div>
          <div className="checkoutSummaryHandoff">
            <strong>After payment</strong>
            <span>Customer service will call or WhatsApp you to confirm the pickup time or local delivery landmark.</span>
          </div>
          <p className="commerceSummaryLine"><CreditCard size={16} /> M-Pesa request is sent to your phone after stock is locked.</p>
          <p className="commerceSummaryLine"><Smartphone size={16} /> Keep the same phone reachable for handoff confirmation.</p>
          <p className="commerceSummaryLine"><Clock3 size={16} /> If payment fails or expires, every locked item is released.</p>
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
        <div className={isPaymentSucceeded ? "current" : "pending"}><MessageCircle size={16} /><span>Staff handoff call</span></div>
      </div>

      {isPaymentSucceeded ? (
        <div className="paymentHandoffNotice">
          <MessageCircle size={18} />
          <div>
            <strong>Customer service will contact you next</strong>
            <span>Keep +{reservation.phone} reachable. We will confirm pickup time or Kikuyu local delivery by phone or WhatsApp.</span>
          </div>
        </div>
      ) : null}
      <div className="checkoutPaymentActions">
        <button className="commerceSecondaryButton" type="button" disabled={refreshingPayment} onClick={refreshPaymentStatus}>
          <RefreshCw size={16} /> {refreshingPayment ? "Refreshing..." : "Refresh status"}
        </button>
        {isPaymentSucceeded ? (
          <Link className="commercePrimaryButton" href={`/orders/${encodeURIComponent(reservation.orderNumber)}`}>
            View order <ArrowRight size={16} />
          </Link>
        ) : null}
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

function SummaryItems({ items }: { items: ValidatedCartItem[] }) {
  return (
    <div className="summaryItemsList">
      {items.map((item) => (
        <div className="summaryProduct" key={item.requestedProductId}>
          <div className="summaryProductImage">
            {item.storefrontImage ? <img src={item.storefrontImage} alt="" /> : null}
          </div>
          <div>
            <strong>{item.title}</strong>
            <span>{[item.size, item.condition].filter(Boolean).join(" / ") || "Kikuyu warehouse"}</span>
          </div>
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

function CheckoutProgress({ stage }: { stage: CheckoutStage }) {
  const steps: Array<{ key: CheckoutStage; label: string }> = [
    { key: "details", label: "Review" },
    { key: "payment", label: "M-Pesa" },
    { key: "complete", label: "Confirmed" }
  ];

  return (
    <div className="checkoutProgress" aria-label="Checkout progress">
      {steps.map((step, index) => (
        <div key={step.key} className={`checkoutStep ${checkoutStepStatus(stage, step.key)}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{step.label}</strong>
        </div>
      ))}
    </div>
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
