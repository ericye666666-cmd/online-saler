"use client";

import { Check, Copy, ExternalLink, Headphones, MessageCircle } from "lucide-react";
import { useState } from "react";
import {
  customerServiceUrl,
  Product,
  productUrl,
  whatsappShareUrl,
} from "../data/products";
import { recordClientEvent } from "../lib/client-events";
import { ProductCardShareButton } from "./product-card-share-button";

type ShareActionsProps = {
  product: Product;
  sellerRef?: string;
  supportPhone?: string;
};

export function ShareActions({ product, sellerRef, supportPhone = "" }: ShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const directUrl = productUrl(product.code, sellerRef);
  const supportUrl = customerServiceUrl(product, sellerRef, supportPhone);

  async function copyLink() {
    await navigator.clipboard.writeText(directUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="shareActions">
      <ProductCardShareButton
        product={product}
        sellerRef={sellerRef}
        className="primaryWhatsappButton"
      />

      <a
        className="whatsappTextButton"
        href={whatsappShareUrl(product, sellerRef)}
        target="_blank"
        rel="noreferrer"
      >
        <MessageCircle size={19} fill="currentColor" />
        Share link on WhatsApp
        <ExternalLink size={17} />
      </a>

      <button className="copyLinkButton" type="button" onClick={copyLink}>
        {copied ? <Check size={18} /> : <Copy size={18} />}
        {copied ? "Link copied" : "Copy product link"}
      </button>

      {supportUrl ? (
        <a
          className="customerServiceButton"
          href={supportUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            recordClientEvent({
              eventType: "contact_click",
              productCode: product.code,
              sellerRef,
            })
          }
        >
          <Headphones size={19} />
          Contact Direct Loop customer service
          <ExternalLink size={17} />
        </a>
      ) : null}

      <p className="shareFallbackNotice" aria-live="polite">
        WhatsApp turns this product link into a clickable image card. No extra product text is added.
      </p>

      <div className="sharePreview">
        <span className="sharePreviewLabel">Product card that will be shared</span>
        <img
          className="shareCardImage"
          src={product.ogImage}
          alt={`${product.title} WhatsApp product card preview`}
          width={1200}
          height={630}
        />
        <div className="shareCardLinkRow">
          <a href={directUrl}>{directUrl}</a>
          {sellerRef ? <small>Seller ref: {sellerRef}</small> : null}
        </div>
      </div>
    </div>
  );
}
