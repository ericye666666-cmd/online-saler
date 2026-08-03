"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import {
  Product,
  productUrl,
  whatsappShareUrl,
} from "../data/products";

type ShareActionsProps = {
  product: Product;
  sellerRef?: string;
};

export function ShareActions({ product, sellerRef }: ShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const directUrl = productUrl(product.code, sellerRef);

  async function copyLink() {
    await navigator.clipboard.writeText(directUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="shareActions" aria-label="Share this item">
      <a
        className="whatsappTextButton"
        href={whatsappShareUrl(product, sellerRef)}
        target="_blank"
        rel="noreferrer"
      >
        <MessageCircle size={19} fill="currentColor" />
        WhatsApp
      </a>

      <button className="copyLinkButton" type="button" onClick={copyLink}>
        {copied ? <Check size={18} /> : <Copy size={18} />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <span className="srOnly" aria-live="polite">{copied ? "Product link copied" : ""}</span>
    </div>
  );
}
