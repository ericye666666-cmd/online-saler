"use client";

import Link from "next/link";
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
    return <section className="empty-store"><h1>Your cart</h1><p>Checking item availability...</p></section>;
  }

  if (state === "empty") {
    return (
      <section className="empty-store">
        <h1>Your cart</h1>
        <p>No item selected yet.</p>
        <Link className="reserve-link" href="/">Browse items</Link>
      </section>
    );
  }

  if (state === "unavailable" || !product) {
    return (
      <section className="empty-store">
        <h1>Your cart</h1>
        <p>This item is no longer available.</p>
        <button className="secondary-button" type="button" onClick={clearCart}>Clear cart</button>
      </section>
    );
  }

  const subtotal = cartSubtotalKsh(snapshot);

  return (
    <section className="checkout-layout" aria-label="Cart item">
      <article className="cart-item">
        <div className="cart-photo">
          {productImageSrc(product) ? <img src={productImageSrc(product)} alt={product.title ?? "Selected item"} /> : <span>No photo</span>}
        </div>
        <div className="cart-copy">
          <p className="detail-meta">{productMeta(product)}</p>
          <h1>{product.title ?? "Second-hand item"}</h1>
          <strong>{moneyKsh(product.priceKsh)}</strong>
          <p className="checkout-note">Cart does not reserve this item. Stock is checked again before payment.</p>
          <button className="secondary-button" type="button" onClick={clearCart}>Remove</button>
        </div>
      </article>

      <aside className="checkout-summary">
        <h2>Order summary</h2>
        <div className="summary-row"><span>Item</span><strong>{moneyKsh(subtotal)}</strong></div>
        <div className="summary-row"><span>Delivery</span><strong>Choose next</strong></div>
        <Link className="reserve-link full" href="/checkout">Continue</Link>
      </aside>
    </section>
  );
}
