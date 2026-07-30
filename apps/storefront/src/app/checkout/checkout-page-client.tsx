"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KIKUYU_DELIVERY_FEE_KSH } from "@online-saler/business-rules";
import { CART_STORAGE_KEY, cartSubtotalKsh, parseCartSnapshot, type CartSnapshot } from "../storefront-cart";
import { moneyKsh, type PublicProduct } from "../storefront-products";

type CheckoutState = "loading" | "empty" | "ready" | "unavailable";

export function CheckoutPageClient() {
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [state, setState] = useState<CheckoutState>("loading");
  const [fulfillment, setFulfillment] = useState("PICKUP");

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

  const itemTotal = cartSubtotalKsh(snapshot);
  const deliveryFee = fulfillment === "DELIVERY" ? KIKUYU_DELIVERY_FEE_KSH : 0;
  const total = itemTotal + deliveryFee;

  return (
    <section className="checkout-layout" aria-label="Checkout">
      <form className="checkout-form">
        <div>
          <p className="detail-meta">One item checkout</p>
          <h1>Checkout</h1>
          <p className="checkout-note">Payment will reserve the item for 15 minutes in the next step.</p>
        </div>

        <label>
          <span>Name</span>
          <input name="name" placeholder="Customer name" />
        </label>
        <label>
          <span>M-Pesa phone</span>
          <input inputMode="tel" name="phone" placeholder="07..." />
        </label>
        <label>
          <span>Fulfillment</span>
          <select name="fulfillment" value={fulfillment} onChange={(event) => setFulfillment(event.target.value)}>
            <option value="PICKUP">Kikuyu pickup</option>
            <option value="DELIVERY">Kikuyu local delivery</option>
          </select>
        </label>
        <label>
          <span>Delivery note</span>
          <textarea name="deliveryNote" placeholder="Leave blank for pickup" />
        </label>

        <button className="reserve-button" type="button" disabled>
          M-Pesa payment coming next
        </button>
      </form>

      <aside className="checkout-summary">
        <h2>Order summary</h2>
        <div className="summary-item">
          <span>{product.title ?? "Second-hand item"}</span>
          <strong>{moneyKsh(product.priceKsh)}</strong>
        </div>
        <div className="summary-row"><span>Item</span><strong>{moneyKsh(itemTotal)}</strong></div>
        <div className="summary-row"><span>{fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}</span><strong>{moneyKsh(deliveryFee)}</strong></div>
        <div className="summary-row total"><span>Total</span><strong>{moneyKsh(total)}</strong></div>
      </aside>
    </section>
  );
}
