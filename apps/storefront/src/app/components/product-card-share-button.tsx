"use client";

import { Check, Link2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import {
  Product,
  productUrl,
} from "../data/products";
import { recordClientEvent } from "../lib/client-events";

type ProductCardShareButtonProps = {
  product: Product;
  sellerRef?: string;
  className?: string;
  compact?: boolean;
};

type ShareState = "idle" | "sharing" | "shared";

export function ProductCardShareButton({
  product,
  sellerRef,
  className = "productCardShareButton",
  compact = false,
}: ProductCardShareButtonProps) {
  const [state, setState] = useState<ShareState>("idle");

  async function shareCard() {
    if (state === "sharing") return;
    setState("sharing");

    try {
      const directUrl = productUrl(product.code, sellerRef);
      recordClientEvent({
        eventType: "share_action",
        productCode: product.code,
        sellerRef,
      });

      if (navigator.share) {
        await navigator.share({ text: directUrl });
      } else {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(directUrl)}`,
          "_blank",
          "noopener,noreferrer",
        );
      }

      setState("shared");
      window.setTimeout(() => setState("idle"), 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setState("idle");
        return;
      }
      setState("idle");
    }
  }

  const label =
    state === "sharing"
      ? "Preparing card..."
      : state === "shared"
        ? "Shared"
        : "Share clickable card";

  return (
    <button
      className={className}
      type="button"
      onClick={shareCard}
      disabled={state === "sharing"}
      aria-label={compact ? `Share ${product.title} clickable product card` : undefined}
      title={compact ? "Share clickable product card" : undefined}
    >
      {state === "sharing" ? (
        <LoaderCircle className="shareSpinner" size={compact ? 19 : 22} />
      ) : state === "shared" ? (
        <Check size={compact ? 19 : 22} />
      ) : (
        <Link2 size={compact ? 19 : 22} />
      )}
      {compact ? null : <span>{label}</span>}
    </button>
  );
}
