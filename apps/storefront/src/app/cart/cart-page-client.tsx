"use client";

import Link from "next/link";
import { ArrowRight, Clock3, CreditCard, MapPin, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CART_STORAGE_KEY, cartSubtotalKsh, parseCartSnapshot, type CartSnapshot } from "../storefront-cart";
import { moneyKsh, productImageSrc, productMeta, type PublicProduct } from "../storefront-products";

type CartState = "loading" | "empty" | "ready" | "unavailable";

export function CartPageClient() {
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [state, setState] = useState<CartState>("loading");

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

  function clearCart() {
    window.localStorage.removeItem(CART_STORAGE_KEY);
    setSnapshot(null);
    setProduct(null);
    setState("empty");
  }

  if (state === "loading") {
    return <CheckoutEmpty title="Your cart" body="Checking the selected item..." />;
  }

  if (state === "empty") {
    return (
      <CheckoutEmpty
        title="Your cart is empty"
        body="Choose one available item from the shop, then come back here to confirm details before payment."
        action={<Link className="commercePrimaryButton" href="/">Browse items <ArrowRight size={16} /></Link>}
      />
    );
  }

  if (state === "unavailable" || !product) {
    return (
      <CheckoutEmpty
        title="This item is no longer available"
        body="Second-hand items are one of one. Clear the cart and pick another available piece."
        action={<button className="commerceSecondaryButton" type="button" onClick={clearCart}>Clear cart</button>}
      />
    );
  }

  const subtotal = cartSubtotalKsh(snapshot);
  const imageSrc = productImageSrc(product);

  return (
    <section className="commerceCheckoutShell" aria-label="Shopping cart">
      <div className="checkoutHero">
        <div>
          <span className="checkoutKicker">Cart</span>
          <h1>Review your item</h1>
          <p className="checkoutLead">One selected piece, checked again before payment.</p>
        </div>
        <CheckoutProgress stage="details" />
      </div>

      <div className="commerceCheckoutGrid">
        <div className="checkoutStack">
          <article className="checkoutPanel cartProductCard">
            <div className="cartProductImage">
              {imageSrc ? <img src={imageSrc} alt={product.title ?? "Selected item"} /> : <span>No photo</span>}
            </div>
            <div className="cartProductCopy">
              <p className="cartProductMeta">{productMeta(product) || "Second-hand fashion / Kikuyu"}</p>
              <div className="cartProductTitleRow">
                <h2>{product.title ?? "Second-hand item"}</h2>
                <strong className="cartProductPrice">{moneyKsh(product.priceKsh)}</strong>
              </div>
              <div className="cartMetaGrid" aria-label="Item details">
                <div><span>Size</span><strong>{product.size ?? "Pending"}</strong></div>
                <div><span>Condition</span><strong>{product.conditionGrade ?? "Pending"}</strong></div>
                <div><span>Location</span><strong>Kikuyu</strong></div>
              </div>
              <div className="commerceNotice">
                <Clock3 size={18} />
                <div>
                  <strong>Cart does not reserve stock</strong>
                  <p>Availability is checked again when you continue to M-Pesa payment.</p>
                </div>
              </div>
              <div className="commerceActions">
                <button className="commerceTextButton" type="button" onClick={clearCart}>
                  <Trash2 size={16} /> Remove item
                </button>
                <Link className="commerceSecondaryButton" href="/">Continue shopping</Link>
              </div>
            </div>
          </article>

          <section className="commerceFeatureGrid" aria-label="Checkout notes">
            <div className="commerceFeature">
              <MapPin size={18} />
              <div><strong>Kikuyu pickup</strong><span>Free pickup from the Kikuyu warehouse.</span></div>
            </div>
            <div className="commerceFeature">
              <ShoppingBag size={18} />
              <div><strong>Local delivery</strong><span>Delivery inside the Kikuyu area is KSh 50.</span></div>
            </div>
            <div className="commerceFeature">
              <ShieldCheck size={18} />
              <div><strong>One available</strong><span>Every listed item is a single second-hand piece.</span></div>
            </div>
          </section>
        </div>

        <aside className="checkoutSummaryPanel">
          <h2>Order summary</h2>
          <SummaryProduct product={product} imageSrc={imageSrc} />
          <div className="commerceSummaryRows">
            <div className="commerceSummaryRow"><span>Item</span><strong>{moneyKsh(subtotal)}</strong></div>
            <div className="commerceSummaryRow"><span>Fulfillment</span><strong>Choose next</strong></div>
            <div className="commerceSummaryRow total"><span>Due now</span><strong>{moneyKsh(subtotal)}</strong></div>
          </div>
          <p className="commerceSummaryLine"><CreditCard size={16} /> M-Pesa starts after you confirm pickup or delivery.</p>
          <Link className="commercePrimaryButton full" href="/checkout">Continue to checkout <ArrowRight size={16} /></Link>
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

export function CheckoutProgress({ stage }: { stage: "details" | "payment" | "complete" }) {
  const steps: Array<{ key: "details" | "payment" | "complete"; label: string; status: string }> = [
    { key: "details", label: "Details", status: stage === "details" ? "current" : "done" },
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

export function SummaryProduct({ product, imageSrc }: { product: PublicProduct; imageSrc: string }) {
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
