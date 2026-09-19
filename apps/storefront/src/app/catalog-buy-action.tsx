"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Product as CatalogProduct } from "./data/products";
import { useStorefrontI18n } from "../i18n/use-storefront-i18n";
import {
  CART_STORAGE_KEY,
  CART_UPDATED_EVENT,
  addCartItem,
  catalogProductToCartItem,
  notifyCartUpdated,
  parseCartSnapshot
} from "./storefront-cart";

function bagHolds(productId: string): boolean {
  try {
    const snapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
    return Boolean(snapshot?.items.some((item) => item.productId === productId));
  } catch {
    return false;
  }
}

export function CatalogBuyAction({ product }: { product: CatalogProduct }) {
  const { t } = useStorefrontI18n();
  const [toast, setToast] = useState("");
  const [buying, setBuying] = useState(false);
  const [inBag, setInBag] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const available = product.status === "Available";
  const productId = catalogProductToCartItem(product).productId;

  // The button reflects the bag, so tapping it on a piece already there is a
  // way into the bag rather than a tap that appears to do nothing.
  useEffect(() => {
    const sync = () => setInBag(bagHolds(productId));
    sync();
    window.addEventListener(CART_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.clearTimeout(toastTimer.current);
    };
  }, [productId]);

  function addToBag() {
    if (!available) return;
    const snapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
    const nextSnapshot = addCartItem(snapshot, catalogProductToCartItem(product));
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextSnapshot));
    notifyCartUpdated();
    // On phones the buttons are pinned to the bottom edge while this box sits
    // far up the page, so confirmation has to appear beside the thumb that
    // tapped, not back where the box is.
    setToast(t("product.addedToBag"));
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  }

  function buyNow() {
    if (!available || buying) return;
    setBuying(true);
    // Buy now pays for this piece alone and leaves the bag exactly as it was,
    // so a quick purchase never drags earlier finds - some since sold - into
    // the payment and blocks it.
    window.location.href = `/checkout?buy=${encodeURIComponent(productId)}`;
  }

  return (
    <div className="catalogBuyBox">
      <div className="catalogBuyActions">
        {available && inBag ? (
          <Link className="catalogBuyButton secondary" href="/cart">
            <Check size={17} aria-hidden="true" /> {t("product.viewBag")}
          </Link>
        ) : (
          <button className="catalogBuyButton secondary" disabled={!available} type="button" onClick={addToBag}>
            {available ? t("product.addToBag") : t("common.unavailable")}
          </button>
        )}
        <button className="catalogBuyButton" disabled={!available || buying} type="button" onClick={buyNow}>
          {available ? (buying ? t("product.openingCheckout") : t("product.buyNow")) : t("common.unavailable")}
        </button>
      </div>
      {available ? <p>{t("product.notReserved")}</p> : null}
      {toast ? (
        <p className="catalogBuyToast" role="status">
          <Check size={16} aria-hidden="true" /> {toast} <Link href="/cart">{t("product.viewBag")}</Link>
        </p>
      ) : null}
    </div>
  );
}
