"use client";

import { useState } from "react";
import type { ProductGalleryItem } from "../product-detail-commerce";

type ProductGalleryProps = {
  items: ProductGalleryItem[];
  productTitle: string;
};

export function ProductGallery({ items, productTitle }: ProductGalleryProps) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  if (!items.length) return null;

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  if (!selected) return null;

  return (
    <section className="productGallery" aria-label="Product images">
      <div className="mainProductImage" aria-live="polite">
        <img src={selected.image} alt={`${productTitle} — ${selected.label}`} />
      </div>
      {items.length > 1 ? (
        <div className="thumbnailRail" aria-label="Choose a product image">
          {items.map((item) => (
            <button
              key={item.id}
              className={item.id === selected.id ? "active" : ""}
              type="button"
              onClick={() => setSelectedId(item.id)}
              aria-label={`Show ${item.label.toLowerCase()}`}
              aria-pressed={item.id === selected.id}
            >
              <img src={item.image} alt="" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
