"use client";

import { pickupPoints, pickupOrderNote } from "./pickup-points";

import Link from "next/link";
import dynamic from "next/dynamic";

const DeliveryAddressPicker = dynamic(() => import("./delivery-address-picker"), { ssr: false });
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  MessageCircle,
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
import { CUSTOMER_SERVICE_PHONE_LABEL, supportWhatsAppUrl } from "../../support/whatsapp";

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
  whatsappPhone: string;
  fulfillment: FulfillmentChoice;
  deliveryAddress: string;
  deliveryNote: string;
  pickupPointId: string;
};

function checkoutDraftStorageKey(customerId: string): string {
  return `online-saler-checkout-draft-v2:${encodeURIComponent(customerId)}`;
}

export function CheckoutPageClient({ mapsApiKey = "", customerId }: { mapsApiKey?: string; customerId: string }) {
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [validation, setValidation] = useState<CartValidationResponse | null>(null);
  const [state, setState] = useState<CheckoutState>("loading");
  const [fulfillment, setFulfillment] = useState<FulfillmentChoice>("PICKUP");
  const [phone, setPhone] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [pickupPointId, setPickupPointId] = useState("");
  const [draftCustomerId, setDraftCustomerId] = useState<string | null>(null);
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
    const draft = readCheckoutDraft(customerId);
    setPhone(draft?.phone ?? "");
    setWhatsappPhone(draft?.whatsappPhone ?? "");
    setFulfillment(draft?.fulfillment ?? "PICKUP");
    setDeliveryAddress(draft?.deliveryAddress ?? "");
    setDeliveryNote(draft?.deliveryNote ?? "");
    setPickupPointId(draft?.pickupPointId ?? "");
    setDraftCustomerId(customerId);
    void loadAndValidate();
  }, [customerId]);

  useEffect(() => {
    if (reservation || draftCustomerId !== customerId) return;
    writeCheckoutDraft(customerId, { phone, whatsappPhone, fulfillment, deliveryAddress, deliveryNote, pickupPointId });
  }, [customerId, draftCustomerId, deliveryAddress, deliveryNote, fulfillment, phone, whatsappPhone, pickupPointId, reservation]);

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
    try {
      const nextSnapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
      setSnapshot(nextSnapshot);
      if (!nextSnapshot?.items.length) {
        setValidation(null);
        setState("empty");
        return null;
      }
      if (showLoading) setState("loading");
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
    setError("");
    const contact = whatsappPhone.trim().replace(/[\s()-]/g, "");
    if (!/^\+?[0-9]{8,15}$/.test(contact)) {
      setError("Enter a valid WhatsApp number, including the country code if outside Kenya.");
      return;
    }
    if (fulfillment === "PICKUP" && !pickupPoints.some((point) => point.id === pickupPointId)) {
      setError("Choose a pickup point before continuing to payment.");
      return;
    }
    if (deliveryRequiresAddress(fulfillment)) {
      if (!deliveryAddress.trim()) {
        setError("Add a delivery address before continuing to payment.");
        return;
      }
      if (deliveryAddress.length > 1500) {
        setError("Your delivery address is too long. Edit it before continuing to payment.");
        return;
      }
    }
    setSubmitting(true);
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
          deliveryNote: [
            `WhatsApp contact: ${contact}`,
            fulfillment === "PICKUP" ? pickupOrderNote(pickupPointId, deliveryNote) : deliveryNote.trim()
          ].filter(Boolean).join("\n")
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
      clearCheckoutDraft(customerId);
    }
  }

  function removePurchasedCartItems(productIds: string[]) {
    try {
      let nextSnapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
      for (const productId of productIds) {
        nextSnapshot = removeCartItem(nextSnapshot, productId);
      }
      if (!nextSnapshot?.items.length) window.localStorage.removeItem(CART_STORAGE_KEY);
      else window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextSnapshot));
    } catch {
      // Browser storage must not turn a confirmed payment into a checkout error.
    }
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
  const deliveryFeeLabel = deliveryFee === 0 ? "Free" : moneyKsh(deliveryFee);
  const totalLabel = hasCheckoutableItems ? moneyKsh(total) : "Not ready";
  const minutes = Math.floor(secondsRemaining / 60).toString().padStart(2, "0");
  const seconds = (secondsRemaining % 60).toString().padStart(2, "0");
  const paymentStatus = payment?.paymentStatus ?? payment?.status ?? null;
  const isPaymentSucceeded = paymentSucceeded(payment?.orderStatus, paymentStatus);
  const isPaymentFailed = paymentFailed(paymentStatus);
  const isPaymentRetryable = canRetryPayment(paymentStatus, secondsRemaining);
  const supportItems = validation.items.slice(0, 3)
    .map((item) => [item.title.slice(0, 120), item.productCode].filter(Boolean).join(" / "))
    .join("; ");
  const checkoutSupportMessage = `Hello Direct Loop, I need help placing an order. Items: ${supportItems}${validation.items.length > 3 ? "; and more items" : ""}.`;
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
                <CheckoutSupport message={checkoutSupportMessage} />
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

                <label className="checkoutField">
                  <span>WhatsApp number</span>
                  <input
                    type="tel"
                    autoComplete="section-whatsapp tel"
                    name="whatsappPhone"
                    placeholder="e.g. +254 7XX XXX XXX"
                    required
                    maxLength={30}
                    aria-describedby="whatsapp-contact-help"
                    value={whatsappPhone}
                    onChange={(event) => setWhatsappPhone(event.target.value)}
                  />
                  <small id="whatsapp-contact-help">Please leave your WhatsApp number. Our customer service team will contact you to arrange pickup or delivery.</small>
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
                      <strong>Choose a pickup point</strong>
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
                      <span>Free</span>
                      <strong>Courier delivery</strong>
                    </div>
                  </label>
                </div>

                {fulfillment === "PICKUP" ? (
                  <div className="checkoutField">
                    <label htmlFor="pickup-point">Pickup point</label>
                    <select id="pickup-point" name="pickupPoint" required value={pickupPointId}
                      disabled={submitting} onChange={(event) => setPickupPointId(event.target.value)}>
                      <option value="">Choose a pickup point</option>
                      {pickupPoints.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
                    </select>
                    {pickupPoints.filter((point) => point.id === pickupPointId).map((point) => (
                      <a key={point.id} href={point.mapsUrl} target="_blank" rel="noopener noreferrer">View {point.name} on Google Maps ↗</a>
                    ))}
                  </div>
                ) : null}

                {requiresAddress ? (
                  <DeliveryAddressPicker
                    apiKey={mapsApiKey}
                    customerId={customerId}
                    value={deliveryAddress}
                    onChange={setDeliveryAddress}
                    disabled={submitting}
                  />
                ) : null}

                <label className="checkoutField">
                  <span>{fulfillment === "PICKUP" ? "Pickup note for customer service" : "Order note (optional)"}</span>
                  <textarea
                    name="deliveryNote"
                    placeholder="Preferred time or anything else the team should know"
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
  const supportMessage = `Hello Direct Loop, I need help with order ${reservation.orderNumber}.`;
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

        <CheckoutSupport message={supportMessage} />

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
      <CheckoutSupport message={supportMessage} />
    </div>
  );
}

function CheckoutSupport({ message }: { message: string }) {
  const { t } = useStorefrontI18n();

  return (
    <section className="paymentSupportRow" aria-label={t("support.title")}>
      <MessageCircle size={22} aria-hidden="true" />
      <div>
        <h2>{t("support.title")}</h2>
        <p>{t("support.phoneHelp", { phone: CUSTOMER_SERVICE_PHONE_LABEL })}</p>
      </div>
      <a className="commerceSecondaryButton" href={supportWhatsAppUrl(message)} target="_blank" rel="noopener noreferrer">
        {t("support.chat")}
      </a>
    </section>
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

function readCheckoutDraft(customerId: string): CheckoutDraft | null {
  try {
    const raw = window.localStorage.getItem(checkoutDraftStorageKey(customerId));
    if (!raw || raw.length > 20_000) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const fields = parsed as Record<string, unknown>;
    const text = (value: unknown, maximum: number) => typeof value === "string" && value.length <= maximum ? value : "";
    return {
      phone: text(fields.phone, 40),
      whatsappPhone: text(fields.whatsappPhone, 30),
      fulfillment: fields.fulfillment === "KIKUYU_LOCAL_DELIVERY" ? "KIKUYU_LOCAL_DELIVERY" : "PICKUP",
      deliveryAddress: text(fields.deliveryAddress, 1500),
      deliveryNote: text(fields.deliveryNote, 10_000),
      pickupPointId: pickupPoints.some((point) => point.id === fields.pickupPointId) ? String(fields.pickupPointId) : ""
    };
  } catch {
    return null;
  }
}

function writeCheckoutDraft(customerId: string, draft: CheckoutDraft) {
  try {
    window.localStorage.setItem(checkoutDraftStorageKey(customerId), JSON.stringify(draft));
  } catch {
    // The current checkout stays usable if browser storage is blocked or full.
  }
}

function clearCheckoutDraft(customerId: string) {
  try {
    window.localStorage.removeItem(checkoutDraftStorageKey(customerId));
  } catch {
    // Clearing an optional local draft is separate from payment confirmation.
  }
}
