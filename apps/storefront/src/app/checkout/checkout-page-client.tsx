"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, CreditCard, MapPin, Navigation, PackageCheck, RefreshCw, Smartphone, Truck } from "lucide-react";
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
import { CART_STORAGE_KEY, cartSubtotalKsh, parseCartSnapshot, type CartSnapshot } from "../storefront-cart";
import { moneyKsh, productImageSrc, productMeta, type PublicProduct } from "../storefront-products";
import { canRetryPayment, paymentBody, paymentFailed, paymentHeading, paymentSucceeded } from "../../payments/payment-ui";

type CheckoutState = "loading" | "empty" | "ready" | "unavailable";
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

const GOOGLE_MAPS_SCRIPT_ID = "direct-loop-google-maps-places";
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

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
  const [refreshingPayment, setRefreshingPayment] = useState(false);
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
        applyPaymentStatus(await response.json() as PaymentState);
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
          deliveryAddress: deliveryRequiresAddress(fulfillment) ? deliveryAddress : null,
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
      window.localStorage.removeItem(CART_STORAGE_KEY);
    }
  }

  if (state === "loading") {
    return <CheckoutEmpty title="Checkout" body="Checking the selected item..." />;
  }

  if (state === "empty") {
    return (
      <CheckoutEmpty
        title="Your cart is empty"
        body="Choose an available item before starting checkout."
        action={<Link className="commercePrimaryButton" href="/">Browse items <ArrowRight size={16} /></Link>}
      />
    );
  }

  if (state === "unavailable" || !product) {
    return (
      <CheckoutEmpty
        title="This item is no longer available"
        body="Second-hand items sell one at a time. Pick another available piece from the shop."
        action={<Link className="commerceSecondaryButton" href="/">Browse another item</Link>}
      />
    );
  }

  const itemTotal = reservation?.itemSubtotalKsh ?? cartSubtotalKsh(snapshot);
  const deliveryFee = reservation?.deliveryFeeKsh ?? (fulfillment === "KIKUYU_LOCAL_DELIVERY" ? KIKUYU_DELIVERY_FEE_KSH : 0);
  const total = reservation?.totalKsh ?? itemTotal + deliveryFee;
  const minutes = Math.floor(secondsRemaining / 60).toString().padStart(2, "0");
  const seconds = (secondsRemaining % 60).toString().padStart(2, "0");
  const paymentStatus = payment?.paymentStatus ?? payment?.status ?? null;
  const isPaymentSucceeded = paymentSucceeded(payment?.orderStatus, paymentStatus);
  const isPaymentFailed = paymentFailed(paymentStatus);
  const isPaymentRetryable = canRetryPayment(paymentStatus, secondsRemaining);
  const requiresAddress = deliveryRequiresAddress(fulfillment);
  const currentStage = checkoutStage(Boolean(reservation), isPaymentSucceeded);
  const imageSrc = productImageSrc(product);

  return (
    <section className="commerceCheckoutShell" aria-label="Checkout">
      <div className="checkoutHero">
        <div>
          <span className="checkoutKicker">Checkout</span>
          <h1>{reservation ? "Complete payment" : "Delivery and payment"}</h1>
          <p className="checkoutLead">
            {reservation
              ? `Order ${reservation.orderNumber} is reserved for payment.`
              : "Your item is reserved for 15 minutes only after you continue to payment."}
          </p>
        </div>
        <CheckoutProgress stage={currentStage} />
      </div>

      <div className="commerceCheckoutGrid">
        <div className="checkoutStack">
          <section className="checkoutPanel">
            <h2>{reservation ? "M-Pesa request" : "How should we fulfill it?"}</h2>

            {reservation ? (
              <div className="reservationCard" role="status">
                <div className="reservationTimer">
                  <div>
                    <strong>{secondsRemaining > 0 ? `${minutes}:${seconds}` : "Expired"}</strong>
                    <span>{secondsRemaining > 0 ? "remaining to complete payment" : "Return to the item and try again."}</span>
                  </div>
                  <Clock3 size={26} />
                </div>
                <p>M-Pesa phone: +{reservation.phone}</p>
                <div className={`paymentStatusCard ${isPaymentSucceeded ? "success" : isPaymentFailed ? "failed" : ""}`}>
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
                  <button className="commerceSecondaryButton full" type="button" disabled={paymentLoading || secondsRemaining <= 0} onClick={() => initiatePayment(reservation.orderId)}>
                    <Smartphone size={16} /> {paymentLoading ? "Retrying..." : "Retry M-Pesa"}
                  </button>
                ) : null}
              </div>
            ) : (
              <form className="checkoutForm" onSubmit={submitCheckout}>
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
                      <p>Collect from the Kikuyu warehouse after payment is confirmed.</p>
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
                      <p>Use address search or type a landmark manually.</p>
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
                  <span>{fulfillment === "PICKUP" ? "Pickup note" : "Delivery note"}</span>
                  <textarea
                    name="deliveryNote"
                    placeholder="Optional note for the team"
                    value={deliveryNote}
                    onChange={(event) => setDeliveryNote(event.target.value)}
                  />
                </label>

                {error ? <p className="checkoutError" role="alert">{error}</p> : null}
                <button className="commercePrimaryButton full" type="submit" disabled={submitting}>
                  <CreditCard size={17} /> {submitting ? "Reserving item..." : "Continue to M-Pesa payment"}
                </button>
              </form>
            )}
          </section>

          <section className="commerceFeatureGrid" aria-label="Checkout safeguards">
            <div className="commerceFeature">
              <Clock3 size={18} />
              <div><strong>15 minute lock</strong><span>Stock is locked only after you continue to payment.</span></div>
            </div>
            <div className="commerceFeature">
              <CheckCircle2 size={18} />
              <div><strong>Live check</strong><span>The server checks price and availability again.</span></div>
            </div>
            <div className="commerceFeature">
              <MapPin size={18} />
              <div><strong>Kikuyu only</strong><span>Pickup is free. Local delivery is KSh 50.</span></div>
            </div>
          </section>
        </div>

        <aside className="checkoutSummaryPanel">
          <h2>Order summary</h2>
          <SummaryProduct product={product} imageSrc={imageSrc} />
          <div className="commerceSummaryRows">
            <div className="commerceSummaryRow"><span>Item</span><strong>{moneyKsh(itemTotal)}</strong></div>
            <div className="commerceSummaryRow"><span>{requiresAddress ? "Delivery" : "Pickup"}</span><strong>{moneyKsh(deliveryFee)}</strong></div>
            <div className="commerceSummaryRow total"><span>Total</span><strong>{moneyKsh(total)}</strong></div>
          </div>
          <p className="commerceSummaryLine"><CreditCard size={16} /> M-Pesa request is sent to your phone after this step.</p>
          <p className="commerceSummaryLine"><Clock3 size={16} /> Cart itself does not reserve the item.</p>
        </aside>
      </div>
    </section>
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
    { key: "details", label: "Details" },
    { key: "payment", label: "M-Pesa" },
    { key: "complete", label: "Done" }
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

function SummaryProduct({ product, imageSrc }: { product: PublicProduct; imageSrc: string }) {
  return (
    <div className="summaryProduct">
      <div className="summaryProductImage">
        {imageSrc ? <img src={imageSrc} alt="" /> : null}
      </div>
      <div>
        <strong>{product.title ?? "Second-hand item"}</strong>
        <span>{productMeta(product) || "Kikuyu warehouse"}</span>
      </div>
    </div>
  );
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
        <span>Delivery address</span>
        <input
          ref={inputRef}
          autoComplete="street-address"
          disabled={disabled}
          name="deliveryAddress"
          placeholder="Search Kikuyu estate, road or landmark"
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
            ? "Google address suggestions are ready. Choose a place or keep typing manually."
            : mapsState === "loading"
              ? "Loading Google address suggestions..."
              : "Address suggestions are not configured yet. You can still type the address manually."}
        </span>
      </div>
      {placeDetails ? (
        <div className="deliveryPlacePreview">
          <strong>{placeDetails.name}</strong>
          <span>{placeDetails.address}</span>
        </div>
      ) : null}
      <p className="deliveryMapHint">Delivery is limited to Kikuyu local area. The team will confirm the landmark by phone.</p>
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
