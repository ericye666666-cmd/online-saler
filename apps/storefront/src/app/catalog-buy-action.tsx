"use client";

import { useState } from "react";
import type { Product as CatalogProduct } from "./data/products";
import {
  CART_STORAGE_KEY,
  catalogProductToCartItem,
  createCartSnapshot
} from "./storefront-cart";

export function CatalogBuyAction({ product }: { product: CatalogProduct }) {
  const [saving, setSaving] = useState(false);
  const available = product.status === "Available";

  function addToCart() {
    if (!available) return;
    setSaving(true);
    const snapshot = createCartSnapshot(catalogProductToCartItem(product));
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(snapshot));
    window.location.href = "/cart";
  }

  return (
    <div className="catalogBuyBox">
      <button
        className="catalogBuyButton"
        disabled={!available || saving}
        type="button"
        onClick={addToCart}
      >
        {available ? (saving ? "Adding..." : "Buy this item") : "Unavailable"}
      </button>
      <p>Cart does not reserve stock. Availability is checked again before payment.</p>
    </div>
  );
}
