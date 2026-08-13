"use client";

import { useState } from "react";
import type { Product as CatalogProduct } from "./data/products";
import { useStorefrontI18n } from "../i18n/use-storefront-i18n";
import {
  CART_STORAGE_KEY,
  addCartItem,
  catalogProductToCartItem,
  notifyCartUpdated,
  parseCartSnapshot
} from "./storefront-cart";

export function CatalogBuyAction({ product }: { product: CatalogProduct }) {
  const { t } = useStorefrontI18n();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<"cart" | "buy" | null>(null);
  const available = product.status === "Available";

  function saveToCart(nextStep: "cart" | "buy") {
    if (!available || saving) return;
    setSaving(nextStep);
    const snapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
    const nextSnapshot = addCartItem(snapshot, catalogProductToCartItem(product));
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextSnapshot));
    notifyCartUpdated();
    setMessage(nextSnapshot.items.length === snapshot?.items.length ? t("product.alreadyInBag") : t("product.addedToBag"));
    if (nextStep === "buy") {
      window.location.href = "/checkout";
      return;
    }
    window.setTimeout(() => setSaving(null), 350);
  }

  return (
    <div className="catalogBuyBox">
      <div className="catalogBuyActions">
        <button
          className="catalogBuyButton secondary"
          disabled={!available || Boolean(saving)}
          type="button"
          onClick={() => saveToCart("cart")}
        >
          {available ? (saving === "cart" ? t("product.adding") : t("product.addToBag")) : t("common.unavailable")}
        </button>
        <button
          className="catalogBuyButton"
          disabled={!available || Boolean(saving)}
          type="button"
          onClick={() => saveToCart("buy")}
        >
          {available ? (saving === "buy" ? t("product.openingCheckout") : t("product.buyNow")) : t("common.unavailable")}
        </button>
      </div>
      <p>{t("product.notReserved")}</p>
      {message ? <p className="catalogBuyMessage" role="status">{message}</p> : null}
    </div>
  );
}
