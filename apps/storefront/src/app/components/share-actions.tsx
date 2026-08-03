"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Product,
  productPath,
  productUrl,
} from "../data/products";

type ShareActionsProps = {
  product: Product;
  sellerRef?: string;
};

export function ShareActions({ product, sellerRef }: ShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const [directUrl, setDirectUrl] = useState(() => productUrl(product.code, sellerRef));

  useEffect(() => {
    setDirectUrl(new URL(productPath(product.code, sellerRef), window.location.origin).toString());
  }, [product.code, sellerRef]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(directUrl);
    } catch {
      const field = document.createElement("textarea");
      field.value = directUrl;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="shareActions" aria-label="Share this item">
      <a
        className="whatsappTextButton"
        href={`https://wa.me/?text=${encodeURIComponent(new URL(productPath(product.code, sellerRef, { source: "whatsapp" }), directUrl).toString())}`}
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
