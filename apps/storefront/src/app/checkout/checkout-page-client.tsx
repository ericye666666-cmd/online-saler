"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { KIKUYU_DELIVERY_FEE_KSH } from "@online-saler/business-rules";
import { CART_STORAGE_KEY, cartSubtotalKsh, parseCartSnapshot, type CartSnapshot } from "../storefront-cart";
import { moneyKsh, type PublicProduct } from "../storefront-products";

type CheckoutState = "loading" | "empty" | "ready" | "unavailable";
type FulfillmentChoice = "PICKUP" | "KIKUYU_LOCAL_DELIVERY";
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

export function CheckoutPageClient() {
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [product, setProduct] = useState<PublicProduct | null>(null);
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
  const [paymentError, setPaymentError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const nextSnapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
    setSnapshot(nextSnapshot);
    if (!nextSnapshot?.item) {
      setState("empty");
      return;
    }

    fetch(`/api-proxy/public/products/${encodeURIComponent(nextSnapshot.item.productId)}`, {
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) {
          setState("unavailable");
          return;
        }
        setProduct((await response.json()) as PublicProduct);
        setState("ready");
      })
      .catch(() => setState("unavailable"));
  }, []);

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
        const result = await response.json() as PaymentState;
        setPayment(result);
        if (result.orderStatus === "PAID") {
          window.localStorage.removeItem(CART_STORAGE_KEY);
        }
      } catch {
        // Polling is advisory; the customer can manually refresh if the network drops.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [payment, reservation]);

  const secondsRemaining = useMemo(() => {
    if (!reservation) return 0;
    return Math.max(0, Math.ceil((new Date(reservation.expiresAt).getTime() - now) / 1000));
  }, [now, reservation]);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot?.item || submitting || reservation) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/checkout/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: snapshot.item.productId,
          phone,
          fulfillmentMethod: fulfillment,
          deliveryAddress: fulfillment === "KIKUYU_LOCAL_DELIVERY" ? deliveryAddress : null,
          deliveryNote: deliveryNote || null
        })
      });
      const result = await response.json().catch(() => ({})) as Reservation & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to reserve this item.");
      setReservation(result);
      setNow(Date.now());
      await initiatePayment(result.orderId);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to reserve this item.");
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
      setPayment(result);
    } catch (paymentStartError) {
      setPaymentError(paymentStartError instanceof Error ? paymentStartError.message : "M-Pesa request could not be started.");
    } finally {
      setPaymentLoading(false);
    }
  }

  if (state === "loading") {
    return <section className="empty-store"><h1>Checkout</h1><p>Checking item availability...</p></section>;
  }

  if (state === "empty") {
    return (
      <section className="empty-store">
        <h1>Checkout</h1>
        <p>Your cart is empty.</p>
        <Link className="reserve-link" href="/">Browse items</Link>
      </section>
    );
  }

  if (state === "unavailable" || !product) {
    return (
      <section className="empty-store">
        <h1>Checkout</h1>
        <p>This item is no longer available.</p>
        <Link className="reserve-link" href="/">Browse another item</Link>
      </section>
    );
  }

  const itemTotal = reservation?.itemSubtotalKsh ?? cartSubtotalKsh(snapshot);
  const deliveryFee = reservation?.deliveryFeeKsh ?? (fulfillment === "KIKUYU_LOCAL_DELIVERY" ? KIKUYU_DELIVERY_FEE_KSH : 0);
  const total = reservation?.totalKsh ?? itemTotal + deliveryFee;
  const minutes = Math.floor(secondsRemaining / 60).toString().padStart(2, "0");
  const seconds = (secondsRemaining % 60).toString().padStart(2, "0");
  const paymentStatus = payment?.paymentStatus ?? payment?.status ?? null;
  const paymentSucceeded = payment?.orderStatus === "PAID" || paymentStatus === "SUCCESS";
  const paymentFailed = ["FAILED", "CANCELLED", "TIMEOUT", "EXPIRED", "MANUAL_REVIEW"].includes(paymentStatus ?? "");

  return (
    <section className="checkout-layout" aria-label="Checkout">
      <form className="checkout-form" onSubmit={submitCheckout}>
        <div>
          <p className="detail-meta">One item checkout</p>
          <h1>{reservation ? "Item reserved" : "Checkout"}</h1>
          <p className="checkout-note">
            {reservation
              ? `Order ${reservation.orderNumber} is reserved for payment.`
              : "Your item is reserved for 15 minutes only after you continue to payment."}
          </p>
        </div>

        {reservation ? (
          <div className="reservation-confirmation" role="status">
            <strong>{secondsRemaining > 0 ? `${minutes}:${seconds}` : "Reservation expired"}</strong>
            <span>{secondsRemaining > 0 ? "remaining to complete M-Pesa payment" : "Return to the item and try again."}</span>
            <p>Phone: +{reservation.phone}</p>
            <div className={`payment-status ${paymentSucceeded ? "success" : paymentFailed ? "failed" : ""}`}>
              <b>
                {paymentSucceeded
                  ? "Payment confirmed"
                  : paymentFailed
                    ? "Payment needs attention"
                    : paymentLoading
                      ? "Sending M-Pesa request..."
                      : "Check your phone for the M-Pesa prompt"}
              </b>
              <span>
                {paymentSucceeded
                  ? `Receipt ${payment?.receiptNumber ?? "pending receipt"}`
                  : paymentError
                    ? paymentError
                    : payment?.customerMessage || payment?.resultDescription || "Enter your M-Pesa PIN to complete the order."}
              </span>
            </div>
            {paymentError ? (
              <button className="reserve-button secondary" type="button" disabled={paymentLoading || secondsRemaining <= 0} onClick={() => initiatePayment(reservation.orderId)}>
                {paymentLoading ? "Retrying..." : "Retry M-Pesa request"}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <label>
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
            <label>
              <span>Fulfillment</span>
              <select name="fulfillment" value={fulfillment} onChange={(event) => setFulfillment(event.target.value as FulfillmentChoice)}>
                <option value="PICKUP">Kikuyu pickup</option>
                <option value="KIKUYU_LOCAL_DELIVERY">Kikuyu local delivery</option>
              </select>
            </label>
            {fulfillment === "KIKUYU_LOCAL_DELIVERY" ? (
              <label>
                <span>Delivery address</span>
                <textarea
                  name="deliveryAddress"
                  placeholder="Estate, building and nearby landmark"
                  required
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                />
              </label>
            ) : null}
            <label>
              <span>{fulfillment === "PICKUP" ? "Pickup note" : "Delivery note"}</span>
              <textarea
                name="deliveryNote"
                placeholder="Optional"
                value={deliveryNote}
                onChange={(event) => setDeliveryNote(event.target.value)}
              />
            </label>

            {error ? <p className="checkout-error" role="alert">{error}</p> : null}
            <button className="reserve-button" type="submit" disabled={submitting}>
              {submitting ? "Reserving item..." : "Continue to M-Pesa payment"}
            </button>
          </>
        )}
      </form>

      <aside className="checkout-summary">
        <h2>Order summary</h2>
        <div className="summary-item">
          <span>{product.title ?? "Second-hand item"}</span>
          <strong>{moneyKsh(product.priceKsh)}</strong>
        </div>
        <div className="summary-row"><span>Item</span><strong>{moneyKsh(itemTotal)}</strong></div>
        <div className="summary-row"><span>{fulfillment === "KIKUYU_LOCAL_DELIVERY" ? "Delivery" : "Pickup"}</span><strong>{moneyKsh(deliveryFee)}</strong></div>
        <div className="summary-row total"><span>Total</span><strong>{moneyKsh(total)}</strong></div>
        <p className="checkout-note">The server checks the live price and availability before creating the reservation.</p>
      </aside>
    </section>
  );
}
