"use client";

import Link from "next/link";
import { ArrowRight, Clock3, CreditCard, MapPin, RefreshCw, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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

type CartState = "loading" | "empty" | "ready" | "error";

export function CartPageClient() {
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [validation, setValidation] = useState<CartValidationResponse | null>(null);
  const [state, setState] = useState<CartState>("loading");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadAndValidate();

    function handleFocus() {
      void loadAndValidate(false);
    }
    const timer = window.setInterval(() => void loadAndValidate(false), 45_000);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  async function loadAndValidate(showLoading = true) {
    const nextSnapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
    setSnapshot(nextSnapshot);
    if (!nextSnapshot?.items.length) {
      setValidation(null);
      setState("empty");
      return;
    }
    if (showLoading) setState("loading");
    setRefreshing(true);
    try {
      const nextValidation = await validateCart(cartProductIds(nextSnapshot));
      setValidation(nextValidation);
      setState("ready");
    } catch {
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }

  function clearCart() {
    window.localStorage.removeItem(CART_STORAGE_KEY);
    notifyCartUpdated();
    setSnapshot(null);
    setValidation(null);
    setState("empty");
  }

  function removeItem(productId: string) {
    const nextSnapshot = removeCartItem(snapshot, productId);
    if (!nextSnapshot.items.length) {
      clearCart();
      return;
    }
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextSnapshot));
    notifyCartUpdated();
    setSnapshot(nextSnapshot);
    void loadAndValidate(false);
  }

  const checkoutableItems = useMemo(() => validation?.items.filter((item) => item.canCheckout) ?? [], [validation]);
  const unavailableItems = useMemo(() => validation?.items.filter((item) => !item.canCheckout) ?? [], [validation]);

  if (state === "loading") {
    return <CheckoutEmpty title="Your cart" body="Checking your items against live stock..." />;
  }

  if (state === "empty") {
    return (
      <CheckoutEmpty
        title="Your cart is empty"
        body="Add one-of-one pieces from the shop, then come back here to confirm them before payment."
        action={<Link className="commercePrimaryButton" href="/">Browse items <ArrowRight size={16} /></Link>}
      />
    );
  }

  if (state === "error" || !validation) {
    return (
      <CheckoutEmpty
        title="Cart could not refresh"
        body="We could not check current stock. Try again before payment."
        action={<button className="commerceSecondaryButton" type="button" onClick={() => loadAndValidate()}>Refresh cart</button>}
      />
    );
  }

  return (
    <section className="commerceCheckoutShell" aria-label="Shopping cart">
      <div className="checkoutHero">
        <div>
          <span className="checkoutKicker">Cart</span>
          <h1>Review your bag</h1>
          <p className="checkoutLead">
            Cart does not reserve stock. We check every piece again before M-Pesa.
          </p>
        </div>
        <CheckoutProgress stage="details" />
      </div>

      <div className="commerceCheckoutGrid">
        <div className="checkoutStack">
          <section className="checkoutPanel">
            <div className="cartSectionHeader">
              <div>
                <h2>{validation.items.length} {validation.items.length === 1 ? "item" : "items"} in cart</h2>
                <p>{checkoutableItems.length} ready for checkout, {unavailableItems.length} unavailable.</p>
              </div>
              <button className="commerceTextButton" type="button" disabled={refreshing} onClick={() => loadAndValidate(false)}>
                <RefreshCw size={16} /> {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="cartLineList">
              {validation.items.map((item) => (
                <CartLine
                  key={item.requestedProductId}
                  item={item}
                  onRemove={() => removeItem(item.requestedProductId)}
                />
              ))}
            </div>

            <div className="commerceActions">
              <button className="commerceTextButton" type="button" onClick={clearCart}>
                <Trash2 size={16} /> Clear cart
              </button>
              <Link className="commerceSecondaryButton" href="/">Continue shopping</Link>
            </div>
          </section>

          <section className="commerceFeatureGrid" aria-label="Checkout notes">
            <div className="commerceFeature">
              <MapPin size={18} />
              <div><strong>Kikuyu pickup</strong><span>Free pickup from the Kikuyu warehouse.</span></div>
            </div>
            <div className="commerceFeature">
              <ShoppingBag size={18} />
              <div><strong>One each</strong><span>Each second-hand item has quantity fixed at one.</span></div>
            </div>
            <div className="commerceFeature">
              <ShieldCheck size={18} />
              <div><strong>All or none</strong><span>Checkout locks all available items together.</span></div>
            </div>
          </section>
        </div>

        <aside className="checkoutSummaryPanel cartStickySummary">
          <h2>Order summary</h2>
          <div className="commerceSummaryRows">
            <div className="commerceSummaryRow"><span>Available items</span><strong>{checkoutableItems.length}</strong></div>
            <div className="commerceSummaryRow"><span>Unavailable items</span><strong>{unavailableItems.length}</strong></div>
            <div className="commerceSummaryRow total"><span>Item subtotal</span><strong>{moneyKsh(validation.summary.itemSubtotalKsh)}</strong></div>
          </div>
          <p className="commerceSummaryLine"><CreditCard size={16} /> M-Pesa starts only after login, phone, and final review.</p>
          <p className="commerceSummaryLine"><Clock3 size={16} /> Payment step locks stock for 15 minutes.</p>
          {checkoutableItems.length ? (
            <Link className="commercePrimaryButton full" href="/checkout">Continue to checkout <ArrowRight size={16} /></Link>
          ) : (
            <button className="commercePrimaryButton full" type="button" disabled>No available items</button>
          )}
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

function CartLine({ item, onRemove }: { item: ValidatedCartItem; onRemove: () => void }) {
  return (
    <article className={`cartLine ${item.canCheckout ? "" : "unavailable"}`}>
      <div className="cartLineImage">
        {item.storefrontImage ? <img src={item.storefrontImage} alt={item.title} /> : <span>No photo</span>}
      </div>
      <div className="cartLineBody">
        <div className="cartLineTop">
          <div>
            <p className="cartProductMeta">{[item.productCode, item.size, item.condition].filter(Boolean).join(" / ")}</p>
            <h2>{item.title}</h2>
          </div>
          <strong className="cartProductPrice">{moneyKsh(item.priceKsh)}</strong>
        </div>
        <div className="cartLineFooter">
          <span className={`cartStatusPill ${item.availability.toLowerCase()}`}>{availabilityLabel(item.availability)}</span>
          <p>{item.statusMessage}</p>
          <button className="commerceTextButton" type="button" onClick={onRemove}>
            <Trash2 size={16} /> Remove
          </button>
        </div>
      </div>
    </article>
  );
}

function availabilityLabel(status: ValidatedCartItem["availability"]): string {
  if (status === "AVAILABLE") return "Available";
  if (status === "TEMPORARILY_RESERVED") return "Reserved";
  if (status === "SOLD") return "Sold";
  if (status === "UNPUBLISHED") return "Unpublished";
  if (status === "REMOVED") return "Removed";
  return "Unavailable";
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

export function CheckoutProgress({ stage }: { stage: "details" | "payment" | "complete" }) {
  const steps: Array<{ key: "details" | "payment" | "complete"; label: string; status: string }> = [
    { key: "details", label: "Cart", status: stage === "details" ? "current" : "done" },
    { key: "payment", label: "M-Pesa", status: stage === "complete" ? "done" : stage === "payment" ? "current" : "pending" },
    { key: "complete", label: "Done", status: stage === "complete" ? "current" : "pending" }
  ];
  return (
    <div className="checkoutProgress" aria-label="Checkout progress">
      {steps.map((step, index) => (
        <div key={step.key} className={`checkoutStep ${step.status}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{step.label}</strong>
        </div>
      ))}
    </div>
  );
}
