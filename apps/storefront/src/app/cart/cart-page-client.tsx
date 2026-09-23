"use client";

import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import type { ReactNode, TouchEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CART_STORAGE_KEY,
  cartProductIds,
  notifyCartUpdated,
  parseCartSnapshot,
  removeCartItem,
  type CartSnapshot
} from "../storefront-cart";
import type { CartValidationResponse, ValidatedCartItem } from "../../cart/cart-validation-types";
import { readSavedCodes, writeSavedCodes } from "../saved-items";
import { cardImageSrc, moneyKsh } from "../storefront-products";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";
import { translateValue } from "../../i18n/dictionary";

type CartState = "loading" | "empty" | "ready" | "error";

/** Width of the two swipe actions, Move to saved and Delete. */
const ACTIONS_WIDTH = 188;

/**
 * The bag, after Vestiaire's: Close / Bag · N items / Edit across the top,
 * one plain row per piece, and the subtotal with a single Next button pinned
 * to the bottom edge. A row swipes left — or every row opens in Edit — to
 * Move to saved or Delete. Saved is the site's one wishlist, the same list
 * the hearts fill; the bag keeps no second "save for later" list of its own.
 */
export function CartPageClient() {
  const { locale, t } = useStorefrontI18n();
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [validation, setValidation] = useState<CartValidationResponse | null>(null);
  const [state, setState] = useState<CartState>("loading");
  const [editing, setEditing] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState("");

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
      setEditing(false);
      setState("empty");
      return;
    }
    if (showLoading) setState("loading");
    try {
      const nextValidation = await validateCart(cartProductIds(nextSnapshot));
      setValidation(nextValidation);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  function removeItem(productId: string) {
    const nextSnapshot = removeCartItem(snapshot, productId);
    if (nextSnapshot.items.length) {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextSnapshot));
    } else {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    }
    notifyCartUpdated();
    setOpenRow(null);
    // Drop the row at once rather than waiting for the stock check.
    setValidation((current) => current ? { ...current, items: current.items.filter((item) => item.requestedProductId !== productId) } : current);
    void loadAndValidate(false);
  }

  function moveToSaved(productId: string) {
    writeSavedCodes([...readSavedCodes(), productId]);
    removeItem(productId);
  }

  async function releaseMyPaymentLock() {
    if (!snapshot?.items.length || releasing) return;
    setReleasing(true);
    setReleaseError("");
    try {
      const response = await fetch("/api/checkout/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productIds: cartProductIds(snapshot) })
      });
      const result = await response.json().catch(() => ({})) as { releasedItems?: number; error?: string };
      if (!response.ok) throw new Error(result.error || t("cart.releaseFailed"));
      await loadAndValidate(false);
    } catch (error) {
      setReleaseError(error instanceof Error ? error.message : t("cart.releaseFailed"));
    } finally {
      setReleasing(false);
    }
  }

  const items = validation?.items ?? [];
  const available = useMemo(() => items.filter((item) => item.canCheckout), [items]);
  const unavailable = useMemo(() => items.filter((item) => !item.canCheckout), [items]);
  const hasReservedItems = unavailable.some((item) => item.availability === "TEMPORARILY_RESERVED");
  const subtotal = available.reduce((sum, item) => sum + (item.priceKsh && item.priceKsh > 0 ? item.priceKsh : 0), 0);
  const count = snapshot?.items.length ?? 0;

  const topBar = (
    <header className="bagTopBar">
      <button type="button" className="bagTopAction" onClick={closeBag}>
        {editing ? t("cart.cancel") : t("cart.close")}
      </button>
      <div className="bagTopTitle">
        <h1>{t("cart.bag")}</h1>
        {count ? <span>{t("cart.itemCount", { count })}</span> : null}
      </div>
      {state === "ready" && items.length ? (
        <button
          type="button"
          className="bagTopAction end"
          onClick={() => { setEditing((current) => !current); setOpenRow(null); }}
          aria-pressed={editing}
        >
          {editing ? t("cart.done") : t("cart.edit")}
        </button>
      ) : <span className="bagTopAction end" aria-hidden="true" />}
    </header>
  );

  function closeBag() {
    if (editing) {
      setEditing(false);
      setOpenRow(null);
      return;
    }
    if (window.history.length > 1) window.history.back();
    else window.location.assign("/");
  }

  if (state === "loading") {
    return <BagFrame top={topBar}><p className="bagMessage">{t("common.loading")}</p></BagFrame>;
  }

  if (state === "empty") {
    return (
      <BagFrame top={topBar}>
        <div className="bagEmpty">
          <h2>{t("cart.empty")}</h2>
          <p>{t("cart.emptyBody")}</p>
          <Link className="bagPrimary" href="/">{t("cart.browse")}</Link>
          <Link className="bagSecondary" href="/saved">{t("cart.openSaved")}</Link>
        </div>
      </BagFrame>
    );
  }

  if (state === "error" || !validation) {
    return (
      <BagFrame top={topBar}>
        <div className="bagEmpty">
          <h2>{t("cart.refreshFailedTitle")}</h2>
          <p>{t("cart.refreshFailedBody")}</p>
          <button className="bagPrimary" type="button" onClick={() => loadAndValidate()}>{t("cart.tryAgain")}</button>
        </div>
      </BagFrame>
    );
  }

  const row = (item: ValidatedCartItem) => (
    <BagRow
      key={item.requestedProductId}
      item={item}
      open={editing || openRow === item.requestedProductId}
      onOpen={(next) => setOpenRow(next ? item.requestedProductId : null)}
      onMoveToSaved={() => moveToSaved(item.requestedProductId)}
      onDelete={() => removeItem(item.requestedProductId)}
      labels={{
        moveToSaved: t("cart.moveToSaved"),
        delete: t("cart.delete"),
        status: statusLabel(item.availability, t),
        condition: item.condition ? translateValue(locale, item.condition) : null
      }}
    />
  );

  return (
    <BagFrame
      top={topBar}
      footer={(
        <footer className="bagFooter">
          <div className="bagSubtotal">
            <span>{t("cart.subtotalShort")}</span>
            <strong>{moneyKsh(subtotal)}</strong>
          </div>
          {available.length ? (
            <Link className="bagPrimary" href="/checkout">{t("cart.next")}</Link>
          ) : (
            <button className="bagPrimary" type="button" disabled>{t("cart.nothingToBuy")}</button>
          )}
        </footer>
      )}
    >
      {hasReservedItems ? (
        <div className="bagNotice">
          <Clock3 size={18} aria-hidden="true" />
          <div>
            <strong>{t("cart.lockTitle")}</strong>
            <p>{t("cart.lockBody")}</p>
            <button type="button" disabled={releasing} onClick={releaseMyPaymentLock}>
              {releasing ? t("cart.releasing") : t("cart.release")}
            </button>
          </div>
        </div>
      ) : null}
      {releaseError ? <p className="bagError" role="alert">{releaseError}</p> : null}

      {available.length ? <ul className="bagList">{available.map(row)}</ul> : null}

      {unavailable.length ? (
        <section className="bagUnavailable" aria-labelledby="bag-unavailable">
          <h2 id="bag-unavailable">{t("cart.noLongerAvailable")}</h2>
          <ul className="bagList">{unavailable.map(row)}</ul>
        </section>
      ) : null}

      <p className="bagFootnote">{t("cart.holdNote")}</p>
      <Link className="bagContinue" href="/">{t("cart.continueShopping")} <ArrowRight size={15} aria-hidden="true" /></Link>
    </BagFrame>
  );
}

function BagFrame({ top, footer, children }: { top: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className={`bagPage ${footer ? "withFooter" : ""}`} aria-label="Shopping bag">
      {top}
      <div className="bagBody">{children}</div>
      {footer}
    </section>
  );
}

function BagRow({ item, open, onOpen, onMoveToSaved, onDelete, labels }: {
  item: ValidatedCartItem;
  open: boolean;
  onOpen: (open: boolean) => void;
  onMoveToSaved: () => void;
  onDelete: () => void;
  labels: { moveToSaved: string; delete: string; status: string | null; condition: string | null };
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const offset = drag ?? (open ? -ACTIONS_WIDTH : 0);
  const href = item.productCode ? `/p/${item.productCode}` : null;
  const image = item.storefrontImage ? cardImageSrc(item.storefrontImage) : null;

  function onTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (touch) start.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (!start.current || !touch) return;
    const dx = touch.clientX - start.current.x;
    const dy = touch.clientY - start.current.y;
    // Vertical scrolling wins until the finger has clearly moved sideways.
    if (drag === null && Math.abs(dx) < 10) return;
    if (drag === null && Math.abs(dy) > Math.abs(dx)) {
      start.current = null;
      return;
    }
    const base = open ? -ACTIONS_WIDTH : 0;
    setDrag(Math.max(-ACTIONS_WIDTH, Math.min(0, base + dx)));
  }

  function onTouchEnd() {
    if (drag !== null) onOpen(drag < -ACTIONS_WIDTH / 3);
    setDrag(null);
    start.current = null;
  }

  return (
    <li className={`bagRow ${item.canCheckout ? "" : "unavailable"}`}>
      <div className="bagRowActions" aria-hidden={!open}>
        <button type="button" className="bagMove" onClick={onMoveToSaved} tabIndex={open ? 0 : -1}>{labels.moveToSaved}</button>
        <button type="button" className="bagDelete" onClick={onDelete} tabIndex={open ? 0 : -1}>{labels.delete}</button>
      </div>
      <div
        className={`bagRowCard ${drag !== null ? "dragging" : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <RowLink href={open ? null : href} className="bagRowImage">
          {image ? <img src={image} alt="" /> : null}
        </RowLink>
        <div className="bagRowText">
          <RowLink href={open ? null : href} className="bagRowTitle">{item.title}</RowLink>
          <p className="bagRowMeta">{[letterSize(item.size), labels.condition].filter(Boolean).join(" · ")}</p>
          {labels.status ? <p className="bagRowStatus">{labels.status}</p> : null}
          <p className="bagRowPrice">{moneyKsh(item.priceKsh ?? 0)}</p>
        </div>
      </div>
    </li>
  );
}

function RowLink({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  return href ? <Link className={className} href={href}>{children}</Link> : <span className={className}>{children}</span>;
}

/** "m" and "xl" read as "M" and "XL", as they do on the product cards. */
function letterSize(size: string | null) {
  return size && /^(x{0,3}[sml]|\d?xl)$/i.test(size.trim()) ? size.trim().toUpperCase() : size;
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

function statusLabel(
  status: ValidatedCartItem["availability"],
  t: ReturnType<typeof useStorefrontI18n>["t"]
): string | null {
  if (status === "AVAILABLE") return null;
  if (status === "TEMPORARILY_RESERVED") return t("cart.statusReserved");
  if (status === "HELD_ON_DEPOSIT") return t("cart.statusDepositHeld");
  if (status === "SOLD") return t("cart.statusSold");
  return t("cart.statusGone");
}
