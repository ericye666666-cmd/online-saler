"use client";

import { useState } from "react";
import type { ProductGalleryItem } from "../product-detail-commerce";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";

type ProductGalleryProps = {
  items: ProductGalleryItem[];
  productTitle: string;
};

export function ProductGallery({ items, productTitle }: ProductGalleryProps) {
  const { t } = useStorefrontI18n();
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  if (!items.length) return null;

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  if (!selected) return null;

  return (
    <section className="productGallery" aria-label={t("product.images")}>
      <div className="mainProductImage" aria-live="polite">
        <img src={selected.image} alt={`${productTitle} — ${selected.label}`} />
      </div>
      {items.length > 1 ? (
        <div className="thumbnailRail" aria-label={t("product.chooseImage")}>
          {items.map((item) => (
            <button
              key={item.id}
              className={item.id === selected.id ? "active" : ""}
              type="button"
              onClick={() => setSelectedId(item.id)}
              aria-label={t("product.showImage", { label: item.label.toLowerCase() })}
              aria-pressed={item.id === selected.id}
            >
              <img src={item.image} alt="" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {items.length > 1 ? (
        <div className="productGalleryProgress" aria-hidden="true">
          {items.map((item) => <span key={item.id} className={item.id === selected.id ? "active" : ""} />)}
        </div>
      ) : null}
    </section>
  );
}
