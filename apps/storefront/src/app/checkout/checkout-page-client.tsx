"use client";

import type { PickupPoint } from "./pickup-points";

import Link from "next/link";
import dynamic from "next/dynamic";

const DeliveryAddressPicker = dynamic(() => import("./delivery-address-picker"), { ssr: false });
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CreditCard,
  Loader2,
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
import { friendlyFailureReason, paymentStage, paymentSucceeded, type PaymentStage } from "../../payments/payment-ui";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";
import { CUSTOMER_SERVICE_PHONE_LABEL, supportWhatsAppUrl } from "../../support/whatsapp";

type CheckoutState = "loading" | "empty" | "ready" | "error";
type CheckoutStepId = "contact" | "handoff";
type PaymentPlan = "FULL" | "DEPOSIT_50";
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
  paymentPlan: PaymentPlan;
  depositKsh: number;
  balanceKsh: number;
  /** What this M-Pesa prompt asks for: the total, or the deposit. */
  amountDueNowKsh: number;
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
  paymentPlan?: PaymentPlan;
  balanceKsh?: number;
  balanceDueAt?: string | null;
  balanceDaysLeft?: number | null;
};
type CheckoutDraft = {
  phone: string;
  whatsappPhone: string;
  fulfillment: FulfillmentChoice;
  deliveryAddress: string;
  deliveryNote: string;
  pickupPointId: string;
};

const DEPOSIT_HOLD_DAYS = 7;
/** The deposit rounds up, matching `depositAmountKsh` on the server. */
function depositDueNowKsh(totalKsh: number): number {
  return Math.ceil(totalKsh / 2);
}

function buyNowProductId(): string | null {
  return new URLSearchParams(window.location.search).get("buy")?.trim() || null;
}

function checkoutDraftStorageKey(draftKey: string): string {
  return `online-saler-checkout-draft-v2:${encodeURIComponent(draftKey)}`;
}

// draftKey scopes the locally saved checkout draft: a signed-in customer id, or
// "guest" for shoppers who go straight to payment without an account.
export function CheckoutPageClient({ mapsApiKey = "", draftKey, signedIn = false, pickupPoints = [] }: { mapsApiKey?: string; draftKey: string; signedIn?: boolean; pickupPoints?: PickupPoint[] }) {
  const { t } = useStorefrontI18n();
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [validation, setValidation] = useState<CartValidationResponse | null>(null);
  const [state, setState] = useState<CheckoutState>("loading");
  const [fulfillment, setFulfillment] = useState<FulfillmentChoice>("PICKUP");
  const [phone, setPhone] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [pickupPointId, setPickupPointId] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("FULL");
  // Checkout is an overview with two collapsed steps; opening one replaces the
  // overview so the shopper answers a single question at a time.
  const [activeStep, setActiveStep] = useState<CheckoutStepId | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [buyNowId, setBuyNowId] = useState<string | null>(null);
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);
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
    const draft = readCheckoutDraft(draftKey);
    setPhone(draft?.phone ?? "");
    setWhatsappPhone(draft?.whatsappPhone ?? "");
    setFulfillment(draft?.fulfillment ?? "PICKUP");
    setDeliveryAddress(draft?.deliveryAddress ?? "");
    setDeliveryNote(draft?.deliveryNote ?? "");
    setPickupPointId(draft?.pickupPointId ?? "");
    setLoadedDraftKey(draftKey);
    void loadAndValidate();
  }, [draftKey]);

  useEffect(() => {
    if (reservation || loadedDraftKey !== draftKey) return;
    writeCheckoutDraft(draftKey, { phone, whatsappPhone, fulfillment, deliveryAddress, deliveryNote, pickupPointId });
  }, [draftKey, loadedDraftKey, deliveryAddress, deliveryNote, fulfillment, phone, whatsappPhone, pickupPointId, reservation]);

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
      // "Buy now" checks out one piece and ignores the bag entirely.
      const buyId = buyNowProductId();
      setBuyNowId(buyId);
      const productIds = buyId ? [buyId] : nextSnapshot ? cartProductIds(nextSnapshot) : [];
      if (!productIds.length) {
        setValidation(null);
        setState("empty");
        return null;
      }
      if (showLoading) setState("loading");
      const nextValidation = await validateCart(productIds);
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
      setError(t("checkout.errWhatsapp"));
      return;
    }
    if (fulfillment === "PICKUP" && !pickupPoints.some((point) => point.id === pickupPointId)) {
      setError(t("checkout.errPickupPoint"));
      return;
    }
    if (deliveryRequiresAddress(fulfillment)) {
      if (!deliveryAddress.trim()) {
        setError(t("checkout.errAddress"));
        return;
      }
      if (deliveryAddress.length > 1500) {
        setError(t("checkout.errAddressLong"));
        return;
      }
    }
    setSubmitting(true);
    try {
      const freshValidation = await loadAndValidate(false);
      const payableItems = freshValidation?.items.filter((item) => item.canCheckout && item.productId) ?? [];
      if (!payableItems.length) throw new Error(t("checkout.errNoPayable"));
      if ((freshValidation?.summary.unavailableCount ?? 0) > 0) {
        throw new Error(t("checkout.errUnavailable"));
      }
      const response = await fetch("/api/checkout/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productIds: payableItems.map((item) => item.requestedProductId),
          phone,
          fulfillmentMethod: fulfillment,
          deliveryAddress: deliveryRequiresAddress(fulfillment) ? deliveryAddress : null,
          // The pickup point and the WhatsApp number are columns now, not a
          // sentence pasted into the note, so orders can be routed and counted
          // by store and support can search by contact number.
          fulfillmentNodeId: fulfillment === "PICKUP" ? pickupPointId : null,
          whatsappPhone: contact,
          deliveryNote: deliveryNote.trim() || null,
          paymentPlan
        })
      });
      const result = await response.json().catch(() => ({})) as Reservation & { error?: string };
      if (!response.ok) throw new Error(result.error || t("checkout.errReserve"));
      const nextReservedCartIds = payableItems.map((item) => item.requestedProductId);
      reservedCartIdsRef.current = nextReservedCartIds;
      setReservedCartIds(nextReservedCartIds);
      setReservation(result);
      setNow(Date.now());
      await initiatePayment(result.orderId);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : t("checkout.errReserve"));
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
      if (!response.ok) throw new Error(result.error || t("checkout.errPaymentStatus"));
      applyPaymentStatus(result);
    } catch (refreshError) {
      setPaymentError(refreshError instanceof Error ? refreshError.message : t("checkout.errPaymentStatus"));
    } finally {
      setRefreshingPayment(false);
    }
  }

  function applyPaymentStatus(nextPayment: PaymentState) {
    setPayment(nextPayment);
    if (paymentSucceeded(nextPayment.orderStatus, nextPayment.paymentStatus ?? nextPayment.status)) {
      removeBagItems(reservedCartIdsRef.current.length ? reservedCartIdsRef.current : reservedCartIds);
      clearCheckoutDraft(draftKey);
    }
  }

  // Drop pieces from the bag from inside checkout, so an item that sold while it
  // waited there never strands the shopper at a disabled pay button.
  async function removeFromBag(productIds: string[]) {
    removeBagItems(productIds);
    await loadAndValidate(false);
  }

  function removeBagItems(productIds: string[]) {
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
    return <CheckoutEmpty title={t("checkout.title")} body={t("checkout.loadingBody")} />;
  }

  if (state === "empty") {
    return (
      <CheckoutEmpty
        title={t("checkout.emptyTitle")}
        body={t("checkout.emptyBody")}
        action={<Link className="commercePrimaryButton" href="/">{t("checkout.browseItems")} <ArrowRight size={16} /></Link>}
      />
    );
  }

  if (state === "error" || !validation) {
    return (
      <CheckoutEmpty
        title={t("checkout.refreshTitle")}
        body={t("checkout.refreshBody")}
        action={<button className="commerceSecondaryButton" type="button" onClick={() => loadAndValidate()}>{t("checkout.refreshAction")}</button>}
      />
    );
  }

  const hasCheckoutableItems = checkoutableItems.length > 0;
  const requiresAddress = deliveryRequiresAddress(fulfillment);
  const itemTotal = reservation?.itemSubtotalKsh ?? validation.summary.itemSubtotalKsh;
  const deliveryFee = reservation?.deliveryFeeKsh ?? (fulfillment === "KIKUYU_LOCAL_DELIVERY" ? KIKUYU_DELIVERY_FEE_KSH : 0);
  const total = reservation?.totalKsh ?? itemTotal + deliveryFee;
  const itemTotalLabel = hasCheckoutableItems ? moneyKsh(itemTotal) : t("checkout.notAvailable");
  const deliveryFeeLabel = deliveryFee === 0 ? t("checkout.free") : moneyKsh(deliveryFee);
  const totalLabel = hasCheckoutableItems ? moneyKsh(total) : t("checkout.notReady");
  // A deposit needs two shillings to split into two M-Pesa payments; below that
  // the choice is not offered at all rather than shown and refused.
  const depositAvailable = hasCheckoutableItems && total >= 2;
  const onDeposit = depositAvailable && paymentPlan === "DEPOSIT_50";
  const depositNow = reservation?.depositKsh || depositDueNowKsh(total);
  const depositBalance = reservation?.balanceKsh || total - depositNow;
  const dueNow = reservation?.amountDueNowKsh ?? (onDeposit ? depositNow : total);
  const dueNowLabel = hasCheckoutableItems ? moneyKsh(dueNow) : t("checkout.notReady");
  const paymentStatus = payment?.paymentStatus ?? payment?.status ?? null;
  const isPaymentSucceeded = paymentSucceeded(payment?.orderStatus, paymentStatus);
  const supportItems = validation.items.slice(0, 3)
    .map((item) => [item.title.slice(0, 120), item.productCode].filter(Boolean).join(" / "))
    .join("; ");
  const checkoutSupportMessage = `Hello Direct Loop, I need help placing an order. Items: ${supportItems}${validation.items.length > 3 ? "; and more items" : ""}.`;

  // One source of truth for "what is still missing", so the step rows, the step
  // buttons and the pay button never disagree about whether checkout is ready.
  const contactBlocker = !phone.trim()
    ? t("checkout.blockPhone")
    : !/^\+?[0-9]{8,15}$/.test(whatsappPhone.trim().replace(/[\s()-]/g, ""))
      ? t("checkout.blockWhatsapp")
      : null;
  const selectedPickupPoint = pickupPoints.find((point) => point.id === pickupPointId);
  const handoffBlocker = fulfillment === "PICKUP"
    ? (selectedPickupPoint ? null : t("checkout.blockPickup"))
    : (deliveryAddress.trim() ? null : t("checkout.blockAddress"));
  const payBlocker = !hasCheckoutableItems
    ? t("checkout.blockEmpty")
    : unavailableItems.length
      ? (buyNowId ? t("checkout.blockBuyNowGone") : t("checkout.blockRemoveUnavailable"))
      : contactBlocker ?? handoffBlocker;
  const contactSummary = contactBlocker
    ? t("checkout.contactSummaryEmpty")
    : `${phone.trim()} · WhatsApp ${whatsappPhone.trim()}`;
  // The step row already carries "Pickup" or "Delivery" as its title, so the
  // summary states only the answer.
  const handoffSummary = fulfillment === "PICKUP"
    ? (selectedPickupPoint ? selectedPickupPoint.name : t("checkout.pickupSummaryEmpty"))
    : (deliveryAddress.trim() ? deliveryAddress.split("\n")[0] : t("checkout.deliverySummaryEmpty"));
  if (reservation && isPaymentSucceeded) {
    return (
      <section className="commerceCheckoutShell checkoutSuccessShell" aria-label={t("checkout.paymentConfirmationLabel")}>
        <PaymentPanel
          signedIn={signedIn}
          isPaymentSucceeded={isPaymentSucceeded}
          payment={payment}
          paymentError={paymentError}
          paymentLoading={paymentLoading}
          refreshPaymentStatus={refreshPaymentStatus}
          refreshingPayment={refreshingPayment}
          reservation={reservation}
          retryPayment={() => initiatePayment(reservation.orderId)}
          secondsRemaining={secondsRemaining}
        />
      </section>
    );
  }

  return (
    <section className="commerceCheckoutShell" aria-label={t("checkout.title")}>
      <div className="checkoutHero">
        <h1>{reservation ? t("checkout.completePayment") : t("checkout.title")}</h1>
      </div>

      <div className="checkoutSingleColumn">
        <div className="checkoutStack">
          <section className="checkoutPanel">
            {reservation ? (
              <PaymentPanel
                signedIn={signedIn}
                isPaymentSucceeded={isPaymentSucceeded}
                payment={payment}
                paymentError={paymentError}
                paymentLoading={paymentLoading}
                refreshPaymentStatus={refreshPaymentStatus}
                refreshingPayment={refreshingPayment}
                reservation={reservation}
                retryPayment={() => initiatePayment(reservation.orderId)}
                secondsRemaining={secondsRemaining}
              />
            ) : activeStep ? (
              <CheckoutStepPanel
                step={activeStep}
                blocker={activeStep === "contact" ? contactBlocker : handoffBlocker}
                onBack={() => setActiveStep(null)}
                submitting={submitting}
                phone={phone}
                setPhone={setPhone}
                whatsappPhone={whatsappPhone}
                setWhatsappPhone={setWhatsappPhone}
                fulfillment={fulfillment}
                setFulfillment={setFulfillment}
                pickupPointId={pickupPointId}
                pickupPoints={pickupPoints}
                setPickupPointId={setPickupPointId}
                deliveryAddress={deliveryAddress}
                setDeliveryAddress={setDeliveryAddress}
                deliveryNote={deliveryNote}
                setDeliveryNote={setDeliveryNote}
                mapsApiKey={mapsApiKey}
                draftKey={draftKey}
              />
            ) : (
              <form className="checkoutForm checkoutOverview" onSubmit={submitCheckout}>
                <CheckoutItemsSummary
                  items={validation.items}
                  // A blocked item is the reason payment is disabled, so it is
                  // never hidden behind the collapsed row.
                  open={itemsOpen || unavailableItems.length > 0}
                  onToggle={() => setItemsOpen((current) => !current)}
                  totalLabel={itemTotalLabel}
                  onRemove={buyNowId ? undefined : (productId) => void removeFromBag([productId])}
                />
                {unavailableItems.length ? (
                  <div className="checkoutError checkoutUnavailable" role="alert">
                    <span>
                      {buyNowId
                        ? t("checkout.buyNowGoneAlert")
                        : unavailableItems.length === 1
                          ? t("checkout.bagBlockedOne")
                          : t("checkout.bagBlocked", { count: String(unavailableItems.length) })}
                    </span>
                    {buyNowId ? null : (
                      <button type="button" onClick={() => void removeFromBag(unavailableItems.map((item) => item.requestedProductId))}>
                        {unavailableItems.length === 1 ? t("checkout.removeIt") : t("checkout.removeThem")}
                      </button>
                    )}
                  </div>
                ) : null}

                <div className="checkoutSteps">
                  <CheckoutStepRow
                    index={1}
                    title={t("checkout.stepContact")}
                    summary={contactSummary}
                    complete={!contactBlocker}
                    onOpen={() => setActiveStep("contact")}
                  />
                  <CheckoutStepRow
                    index={2}
                    title={requiresAddress ? t("checkout.stepDelivery") : t("checkout.stepPickup")}
                    summary={handoffSummary}
                    complete={!handoffBlocker}
                    onOpen={() => setActiveStep("handoff")}
                  />
                </div>

                {depositAvailable ? (
                  <PaymentPlanChoice
                    plan={paymentPlan}
                    onChange={setPaymentPlan}
                    totalLabel={totalLabel}
                    depositLabel={moneyKsh(depositNow)}
                    balanceLabel={moneyKsh(depositBalance)}
                  />
                ) : null}

                <div className="commerceSummaryRows">
                  <div className="commerceSummaryRow"><span>{t("checkout.rowItems")}</span><strong>{itemTotalLabel}</strong></div>
                  <div className="commerceSummaryRow"><span>{requiresAddress ? t("checkout.stepDelivery") : t("checkout.stepPickup")}</span><strong>{deliveryFeeLabel}</strong></div>
                  <div className="commerceSummaryRow total"><span>{t("checkout.rowTotal")}</span><strong>{totalLabel}</strong></div>
                  {onDeposit ? (
                    <>
                      <div className="commerceSummaryRow"><span>{t("plan.rowPayNow")}</span><strong>{moneyKsh(depositNow)}</strong></div>
                      <div className="commerceSummaryRow"><span>{t("plan.rowBalance", { days: String(DEPOSIT_HOLD_DAYS) })}</span><strong>{moneyKsh(depositBalance)}</strong></div>
                    </>
                  ) : null}
                </div>

                {error ? <p className="checkoutError" role="alert">{error}</p> : null}

                {/* Pinned on phones so the charge is never scrolled out of
                    reach. The button names the amount, so the bar does not
                    repeat the total the breakdown above already gives. */}
                <div className="checkoutPayBar">
                  {payBlocker ? <p className="checkoutPayHint">{payBlocker}</p> : null}
                  <button className="commercePrimaryButton full" type="submit" disabled={submitting || Boolean(payBlocker)}>
                    <CreditCard size={17} /> {submitting
                      ? t("checkout.checkingStock")
                      : onDeposit
                        ? t("checkout.payDeposit", { amount: dueNowLabel })
                        : t("checkout.payWith", { amount: dueNowLabel })}
                  </button>
                </div>
              </form>
            )}

            {!reservation && !activeStep ? <CheckoutSupport message={checkoutSupportMessage} /> : null}
          </section>
        </div>
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
  // Module scope, so no hook here. The caller turns this into a message.
  if (!response.ok) throw new Error("CART_VALIDATION_FAILED");
  return response.json() as Promise<CartValidationResponse>;
}

function PaymentPanel({
  signedIn,
  isPaymentSucceeded,
  payment,
  paymentError,
  paymentLoading,
  refreshPaymentStatus,
  refreshingPayment,
  reservation,
  retryPayment,
  secondsRemaining
}: {
  signedIn: boolean;
  isPaymentSucceeded: boolean;
  payment: PaymentState | null;
  paymentError: string;
  paymentLoading: boolean;
  refreshPaymentStatus: () => void;
  refreshingPayment: boolean;
  reservation: Reservation;
  retryPayment: () => void;
  secondsRemaining: number;
}) {
  const { t } = useStorefrontI18n();
  const paymentStatus = payment?.paymentStatus ?? payment?.status ?? null;
  const stage = paymentStage({
    orderStatus: payment?.orderStatus,
    paymentStatus,
    paymentLoading,
    paymentError,
    secondsRemaining
  });
  // What the page softens for the shopper reaches customer service word for
  // word, so staff see the real refusal instead of guessing at it.
  const technicalDetail = paymentError || payment?.resultDescription || "";
  const supportMessage = `Hello Direct Loop, I need help with order ${reservation.orderNumber}.${technicalDetail ? ` The payment page said: ${technicalDetail}` : ""}`;
  // A confirmed deposit is a success, but not the one the normal panel
  // describes: nothing is being prepared and there is still a deadline to meet.
  const depositConfirmed = isPaymentSucceeded && payment?.orderStatus === "DEPOSIT_PAID";
  const chargedKsh = reservation.amountDueNowKsh ?? reservation.totalKsh;
  const balanceDueLabel = payment?.balanceDueAt
    ? new Date(payment.balanceDueAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
    : null;

  if (depositConfirmed) {
    return (
      <div className="paymentSuccessPanel" role="status">
        <div className="paymentSuccessMark"><CheckCircle2 size={36} aria-hidden="true" /></div>
        <div className="paymentSuccessHeading">
          <h1>{t("pay.depositConfirmedTitle")}</h1>
        </div>

        <dl className="paymentSuccessFacts">
          <div><dt>{t("pay.orderLabel")}</dt><dd>{reservation.orderNumber}</dd></div>
          <div><dt>{t("pay.depositPaidLabel")}</dt><dd>{moneyKsh(chargedKsh)}</dd></div>
          <div><dt>{t("pay.balanceLabel")}</dt><dd>{moneyKsh(payment?.balanceKsh ?? reservation.balanceKsh)}</dd></div>
        </dl>

        <section className="paymentNextStep">
          <Clock3 size={24} aria-hidden="true" />
          <div>
            <h2>{balanceDueLabel
              ? t("pay.balanceDueBy", { date: balanceDueLabel })
              : t("pay.balanceDueWithin", { days: String(DEPOSIT_HOLD_DAYS) })}</h2>
            <p>{t("pay.depositNextBody", { phone: `+${reservation.phone}` })}</p>
          </div>
        </section>

        <CheckoutSupport message={supportMessage} />

        <div className="paymentSuccessActions">
          <Link className="commercePrimaryButton" href={`/orders/${encodeURIComponent(reservation.orderNumber)}`}>
            {t("pay.goToOrder")} <ArrowRight size={16} />
          </Link>
          <Link className="commerceTextButton" href="/">{t("cart.continueShopping")}</Link>
        </div>
      </div>
    );
  }

  if (isPaymentSucceeded) {
    return (
      <div className="paymentSuccessPanel" role="status">
        <div className="paymentSuccessMark"><CheckCircle2 size={36} aria-hidden="true" /></div>
        <div className="paymentSuccessHeading">
          <h1>{t("payment.confirmed")}</h1>
        </div>

        <dl className="paymentSuccessFacts">
          <div><dt>{t("pay.orderLabel")}</dt><dd>{reservation.orderNumber}</dd></div>
          <div><dt>{t("pay.paidLabel")}</dt><dd>{moneyKsh(chargedKsh)}</dd></div>
          <div><dt>{t("pay.receiptLabel")}</dt><dd>{payment?.receiptNumber ?? t("pay.receiptConfirmed")}</dd></div>
        </dl>

        <section className="paymentNextStep">
          <PackageCheck size={24} aria-hidden="true" />
          <div>
            <h2>{t("payment.nextTitle")}</h2>
            <p>{`${t("payment.nextBody")} ${t("payment.keepPhone", { phone: `+${reservation.phone}` })}`}</p>
          </div>
        </section>

        <CheckoutSupport message={supportMessage} />

        {!signedIn ? (
          // Offered only after the money is in. Registration must never sit
          // between a shopper and their payment.
          <section className="paymentSaveAccount">
            <div>
              <h2>{t("auth.saveTitle")}</h2>
              <p>{t("auth.saveBody")}</p>
            </div>
            <Link className="commerceSecondaryButton" href={`/login?returnTo=${encodeURIComponent(`/orders/${reservation.orderNumber}`)}`}>
              {t("auth.google")}
            </Link>
          </section>
        ) : null}

        <div className="paymentSuccessActions">
          <Link className="commercePrimaryButton" href={`/orders/${encodeURIComponent(reservation.orderNumber)}`}>
            {t("payment.viewOrder")} <ArrowRight size={16} />
          </Link>
          <Link className="commerceTextButton" href="/">{t("cart.continueShopping")}</Link>
        </div>
      </div>
    );
  }

  const phoneLabel = `+${reservation.phone}`;
  const heldUntil = new Date(reservation.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const copy: Record<PaymentStage, { title: string; body: string }> = {
    sending: { title: t("pay.sendingTitle"), body: t("pay.sendingBody", { phone: phoneLabel }) },
    waiting: {
      title: t("pay.waitingTitle"),
      body: reservation.paymentPlan === "DEPOSIT_50"
        ? t("pay.waitingBodyDeposit", { amount: moneyKsh(chargedKsh), phone: phoneLabel })
        : t("pay.waitingBody", { phone: phoneLabel })
    },
    notSent: { title: t("pay.notSentTitle"), body: t("pay.notSentBody") },
    failed: { title: t("pay.failedTitle"), body: t("pay.failedBody", { reason: friendlyFailureReason(payment?.resultDescription) }) },
    review: { title: t("pay.reviewTitle"), body: t("pay.reviewBody") },
    // The reservation window has been five minutes since 2026-09-23. This line
    // still promised fifteen, which is the one number a shopper whose hold just
    // lapsed would check.
    expired: { title: t("pay.expiredTitle"), body: t("pay.expiredBody", { minutes: String(reservation.reservationMinutes) }) },
    success: { title: t("payment.confirmed"), body: "" }
  };
  const StageIcon = {
    sending: Loader2,
    waiting: Smartphone,
    notSent: AlertCircle,
    failed: AlertCircle,
    review: ReceiptText,
    expired: Clock3,
    success: CheckCircle2
  }[stage];
  const canRetry = (stage === "notSent" || stage === "failed") && secondsRemaining > 0;
  // The hold is a footnote, not a deadline to stare at: shown as the time it
  // ends, and only while the shopper can still act on it.
  const holding = stage === "sending" || stage === "waiting" || stage === "notSent" || stage === "failed";

  return (
    <div className={`payStage ${stage}`} role="status" aria-live="polite">
      <div className="payStageIcon" aria-hidden="true"><StageIcon size={26} /></div>
      <h2 className="payStageTitle">{copy[stage].title}</h2>
      <p className="payStageBody">{copy[stage].body}</p>

      <dl className="payFacts">
        <div><dt>{t("pay.amountLabel")}</dt><dd className="payAmount">{moneyKsh(chargedKsh)}</dd></div>
        <div><dt>{t("pay.phoneLabel")}</dt><dd>{phoneLabel}</dd></div>
        <div><dt>{t("pay.orderLabel")}</dt><dd>{reservation.orderNumber}</dd></div>
      </dl>

      {holding ? (
        <p className="payHold"><Clock3 size={15} aria-hidden="true" /> {t("pay.holdUntil", { time: heldUntil })}</p>
      ) : null}

      <div className="payActions">
        {canRetry ? (
          <button className="commercePrimaryButton full" type="button" disabled={paymentLoading} onClick={retryPayment}>
            <Smartphone size={17} /> {paymentLoading ? t("pay.retrySending") : t("pay.retry")}
          </button>
        ) : null}
        {stage === "waiting" ? (
          <button className="commerceSecondaryButton full" type="button" disabled={refreshingPayment} onClick={refreshPaymentStatus}>
            <RefreshCw size={16} /> {refreshingPayment ? t("pay.confirmChecking") : t("pay.confirmPin")}
          </button>
        ) : null}
        {stage === "expired" ? (
          <button className="commercePrimaryButton full" type="button" onClick={() => window.location.reload()}>
            {t("pay.startAgain")}
          </button>
        ) : null}
      </div>

      <a className="payHelp" href={supportWhatsAppUrl(supportMessage)} target="_blank" rel="noopener noreferrer">
        <MessageCircle size={16} aria-hidden="true" /> {t("pay.help")}
      </a>
    </div>
  );
}

/**
 * Pay in full, or half now and the rest within a week. Both consequences are
 * stated on the card the shopper picks: a deposit holds the piece, and losing
 * the deadline costs them part of that deposit. Somebody choosing this is short
 * of money, so the penalty cannot be a footnote they find out about later.
 */
function PaymentPlanChoice({ plan, onChange, totalLabel, depositLabel, balanceLabel }: {
  plan: PaymentPlan;
  onChange: (plan: PaymentPlan) => void;
  totalLabel: string;
  depositLabel: string;
  balanceLabel: string;
}) {
  const { t } = useStorefrontI18n();

  return (
    <fieldset className="checkoutPlan">
      <legend>{t("plan.legend")}</legend>
      <div className="checkoutPlanOptions">
        <label className={`checkoutPlanOption ${plan === "FULL" ? "selected" : ""}`}>
          <input
            type="radio"
            name="paymentPlan"
            value="FULL"
            checked={plan === "FULL"}
            onChange={() => onChange("FULL")}
          />
          <span className="checkoutPlanText">
            <strong>{t("plan.fullTitle", { amount: totalLabel })}</strong>
            <span>{t("plan.fullBody")}</span>
          </span>
        </label>

        <label className={`checkoutPlanOption ${plan === "DEPOSIT_50" ? "selected" : ""}`}>
          <input
            type="radio"
            name="paymentPlan"
            value="DEPOSIT_50"
            checked={plan === "DEPOSIT_50"}
            onChange={() => onChange("DEPOSIT_50")}
          />
          <span className="checkoutPlanText">
            <strong>{t("plan.depositTitle", { amount: depositLabel })}</strong>
            <span>{t("plan.depositBody", { days: String(DEPOSIT_HOLD_DAYS), amount: balanceLabel })}</span>
            <span className="checkoutPlanWarning">{t("plan.depositWarning")}</span>
          </span>
        </label>
      </div>
    </fieldset>
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

/**
 * The bag collapsed to one line. Four large product cards used to push every
 * input below the fold; the amount stays visible, the detail is one tap away.
 */
function CheckoutItemsSummary({ items, open, onToggle, totalLabel, onRemove }: {
  items: ValidatedCartItem[];
  open: boolean;
  onToggle: () => void;
  totalLabel: string;
  onRemove?: (productId: string) => void;
}) {
  return (
    <div className="checkoutItemsSummary">
      <button className="checkoutItemsToggle" type="button" onClick={onToggle} aria-expanded={open}>
        <span>{items.length} {items.length === 1 ? "item" : "items"}</span>
        <strong>{totalLabel}</strong>
        <ChevronDown size={18} className={open ? "open" : ""} aria-hidden="true" />
      </button>
      {open ? <CheckoutItemsPreview items={items} onRemove={onRemove} /> : null}
    </div>
  );
}

/** A collapsed step: what it is, what has been answered, and a way in. */
function CheckoutStepRow({ index, title, summary, complete, onOpen }: {
  index: number;
  title: string;
  summary: string;
  complete: boolean;
  onOpen: () => void;
}) {
  return (
    <button className={`checkoutStepRow ${complete ? "complete" : ""}`} type="button" onClick={onOpen}>
      <span className="checkoutStepIndex" aria-hidden="true">{complete ? <Check size={14} /> : index}</span>
      <span className="checkoutStepText">
        <strong>{title}</strong>
        <span>{summary}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}

type CheckoutStepPanelProps = {
  step: CheckoutStepId;
  blocker: string | null;
  onBack: () => void;
  submitting: boolean;
  phone: string;
  setPhone: (value: string) => void;
  whatsappPhone: string;
  setWhatsappPhone: (value: string) => void;
  fulfillment: FulfillmentChoice;
  setFulfillment: (value: FulfillmentChoice) => void;
  pickupPointId: string;
  setPickupPointId: (value: string) => void;
  pickupPoints: PickupPoint[];
  deliveryAddress: string;
  setDeliveryAddress: (value: string) => void;
  deliveryNote: string;
  setDeliveryNote: (value: string) => void;
  mapsApiKey: string;
  draftKey: string;
};

/**
 * One step, full width, with its own way back. Inputs stay controlled by the
 * parent, so leaving a step never discards what was typed in it.
 */
function CheckoutStepPanel(props: CheckoutStepPanelProps) {
  const { t } = useStorefrontI18n();
  const { step, blocker, onBack, submitting } = props;
  const requiresAddress = deliveryRequiresAddress(props.fulfillment);

  return (
    <div className="checkoutStepPanel">
      <header className="checkoutStepPanelHead">
        <button type="button" onClick={onBack} aria-label={t("checkout.back")}><ArrowLeft size={22} /></button>
        <strong>{step === "contact" ? t("checkout.stepContact") : requiresAddress ? t("checkout.stepDelivery") : t("checkout.stepPickup")}</strong>
      </header>

      <div className="checkoutStepPanelBody">
        {step === "contact" ? (
          <>
            <label className="checkoutField">
              <span>M-Pesa phone</span>
              <input
                autoComplete="tel"
                inputMode="tel"
                name="phone"
                placeholder="07..."
                required
                autoFocus
                value={props.phone}
                onChange={(event) => props.setPhone(event.target.value)}
              />
            </label>

            <label className="checkoutField">
              <span>{t("checkout.whatsappLabel")}</span>
              <input
                type="tel"
                autoComplete="section-whatsapp tel"
                name="whatsappPhone"
                placeholder="e.g. +254 7XX XXX XXX"
                required
                maxLength={30}
                aria-describedby="whatsapp-contact-help"
                value={props.whatsappPhone}
                onChange={(event) => props.setWhatsappPhone(event.target.value)}
              />
              <small id="whatsapp-contact-help">{t("checkout.whatsappHelp")}</small>
            </label>
          </>
        ) : (
          <>
            <div className="commerceOptionGrid" role="radiogroup" aria-label={t("checkout.fulfillmentLabel")}>
              <label className={`commerceOption ${props.fulfillment === "PICKUP" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="fulfillment"
                  value="PICKUP"
                  checked={props.fulfillment === "PICKUP"}
                  onChange={() => props.setFulfillment("PICKUP")}
                />
                <PackageCheck size={20} />
                <div>
                  <span>{t("checkout.free")}</span>
                  <strong>{t("checkout.optionPickup")}</strong>
                </div>
              </label>
              <label className={`commerceOption ${props.fulfillment === "KIKUYU_LOCAL_DELIVERY" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="fulfillment"
                  value="KIKUYU_LOCAL_DELIVERY"
                  checked={props.fulfillment === "KIKUYU_LOCAL_DELIVERY"}
                  onChange={() => props.setFulfillment("KIKUYU_LOCAL_DELIVERY")}
                />
                <Truck size={20} />
                <div>
                  <span>KSh {KIKUYU_DELIVERY_FEE_KSH}</span>
                  <strong>{t("checkout.optionDelivery")}</strong>
                </div>
              </label>
            </div>

            {props.fulfillment === "PICKUP" ? (
              <div className="checkoutField">
                <label htmlFor="pickup-point">{t("checkout.pickupPointLabel")}</label>
                <select id="pickup-point" name="pickupPoint" required value={props.pickupPointId}
                  disabled={submitting} onChange={(event) => props.setPickupPointId(event.target.value)}>
                  <option value="">{t("checkout.pickupPointPlaceholder")}</option>
                  {props.pickupPoints.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
                </select>
                {props.pickupPoints.filter((point) => point.id === props.pickupPointId && point.mapsUrl).map((point) => (
                  <a key={point.id} href={point.mapsUrl!} target="_blank" rel="noopener noreferrer">{t("checkout.viewOnMaps", { name: point.name })}</a>
                ))}
              </div>
            ) : null}

            {requiresAddress ? (
              <DeliveryAddressPicker
                apiKey={props.mapsApiKey}
                draftKey={props.draftKey}
                value={props.deliveryAddress}
                onChange={props.setDeliveryAddress}
                disabled={submitting}
              />
            ) : null}

            <label className="checkoutField">
              <span>{props.fulfillment === "PICKUP" ? t("checkout.notePickup") : t("checkout.noteDelivery")}</span>
              <textarea
                name="deliveryNote"
                placeholder={t("checkout.notePlaceholder")}
                value={props.deliveryNote}
                onChange={(event) => props.setDeliveryNote(event.target.value)}
              />
            </label>
          </>
        )}
      </div>

      <div className="checkoutPayBar">
        {blocker ? <p className="checkoutPayHint">{blocker}</p> : null}
        <button className="commercePrimaryButton full" type="button" onClick={onBack} disabled={Boolean(blocker)}>
          Save and continue
        </button>
      </div>
    </div>
  );
}

function CheckoutItemsPreview({ items, onRemove }: { items: ValidatedCartItem[]; onRemove?: (productId: string) => void }) {
  return (
    <div className="checkoutItemsPreview">
      {items.map((item) => (
        <div key={item.requestedProductId} className={`checkoutItemPreview ${item.canCheckout ? "" : "blocked"}`}>
          <div className="summaryProductImage">{item.storefrontImage ? <img src={item.storefrontImage} alt="" /> : null}</div>
          <div>
            <strong>{item.title}</strong>
            <span>{[item.productCode, item.size, item.condition].filter(Boolean).join(" / ")}</span>
            {!item.canCheckout ? <small>{item.statusMessage}</small> : null}
            {onRemove ? (
              <button className="checkoutItemRemove" type="button" onClick={() => onRemove(item.requestedProductId)}>
                Remove
              </button>
            ) : null}
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

function readCheckoutDraft(draftKey: string): CheckoutDraft | null {
  try {
    const raw = window.localStorage.getItem(checkoutDraftStorageKey(draftKey));
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
      pickupPointId: text(fields.pickupPointId, 80)
    };
  } catch {
    return null;
  }
}

function writeCheckoutDraft(draftKey: string, draft: CheckoutDraft) {
  try {
    window.localStorage.setItem(checkoutDraftStorageKey(draftKey), JSON.stringify(draft));
  } catch {
    // The current checkout stays usable if browser storage is blocked or full.
  }
}

function clearCheckoutDraft(draftKey: string) {
  try {
    window.localStorage.removeItem(checkoutDraftStorageKey(draftKey));
  } catch {
    // Clearing an optional local draft is separate from payment confirmation.
  }
}
