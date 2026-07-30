"use client";

import { useState } from "react";
import { CART_STORAGE_KEY, createCartSnapshot, productToCartItem } from "./storefront-cart";
import type { PublicProduct } from "./storefront-products";

export function AddToCartButton({ product }: { product: PublicProduct }) {
  const [saving, setSaving] = useState(false);

  function addToCart() {
    setSaving(true);
    const snapshot = createCartSnapshot(productToCartItem(product));
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(snapshot));
    window.location.href = "/cart";
  }

  return (
    <button className="reserve-button" disabled={saving} type="button" onClick={addToCart}>
      {saving ? "Adding..." : "Add to cart"}
    </button>
  );
}
