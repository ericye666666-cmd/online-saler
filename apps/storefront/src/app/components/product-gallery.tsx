"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductGalleryItem } from "../product-detail-commerce";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";

type ProductGalleryProps = {
  items: ProductGalleryItem[];
  productTitle: string;
};

export function galleryIndexAtOffset(offset: number, width: number, count: number) {
  if (width <= 0 || count <= 0 || !Number.isFinite(offset) || !Number.isFinite(width)) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(offset / width)));
}

export function galleryIndexForKey(key: string, current: number, count: number) {
  if (count < 2) return null;
  switch (key) {
    case "ArrowLeft": return Math.max(0, current - 1);
    case "ArrowRight": return Math.min(count - 1, current + 1);
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

export function ProductGallery({ items, productTitle }: ProductGalleryProps) {
  const { t } = useStorefrontI18n();
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef(selectedId);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Keep the current photo aligned when the viewport changes width, including
    // phone rotation. Do not reposition while a swipe is in progress.
    let previousWidth = -1;
    const alignCurrentImage = () => {
      const width = viewport.clientWidth;
      if (width === previousWidth || !width) return;
      previousWidth = width;
      const index = Math.max(0, items.findIndex((item) => item.id === selectedIdRef.current));
      viewport.scrollTo({ left: index * width, behavior: "instant" });
    };
    alignCurrentImage();
    const observer = new ResizeObserver(alignCurrentImage);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [items]);

  if (!items.length) return null;

  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
  const selected = items[selectedIndex];
  if (!selected) return null;

  function selectImage(index: number) {
    const item = items[index];
    const viewport = viewportRef.current;
    if (!item || !viewport) return;
    selectedIdRef.current = item.id;
    setSelectedId(item.id);
    viewport.scrollTo({
      left: index * viewport.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <section className="productGallery" aria-label={t("product.images")}>
      <div
        className="mainProductImage"
        ref={viewportRef}
        role="group"
        aria-label={t("product.chooseImage")}
        tabIndex={items.length > 1 ? 0 : undefined}
        onScroll={(event) => {
          const viewport = event.currentTarget;
          const index = galleryIndexAtOffset(viewport.scrollLeft, viewport.clientWidth, items.length);
          const item = items[index];
          if (item) {
            selectedIdRef.current = item.id;
            setSelectedId(item.id);
          }
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          const index = galleryIndexForKey(event.key, selectedIndex, items.length);
          if (index === null) return;
          event.preventDefault();
          selectImage(index);
        }}
      >
        {items.map((item, index) => (
          <div className="productGallerySlide" key={item.id} aria-hidden={index !== selectedIndex}>
            <img
              src={item.image}
              alt={`${productTitle} — ${item.label}`}
              draggable={false}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ))}
      </div>
      <span className="srOnly" role="status" aria-live="polite" aria-atomic="true">
        {selected.label} ({selectedIndex + 1}/{items.length})
      </span>
      {items.length > 1 ? (
        <div className="thumbnailRail" aria-label={t("product.chooseImage")}>
          {items.map((item, index) => (
            <button
              key={item.id}
              className={item.id === selected.id ? "active" : ""}
              type="button"
              onClick={() => selectImage(index)}
              aria-label={t("product.showImage", { label: item.label.toLowerCase() })}
              aria-pressed={item.id === selected.id}
            >
              <img src={item.image} alt="" loading="lazy" decoding="async" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {items.length > 1 ? (
        <div className="productGalleryProgress" aria-label={t("product.chooseImage")}>
          {items.map((item, index) => (
            <button
              key={item.id}
              className={item.id === selected.id ? "active" : ""}
              type="button"
              onClick={() => selectImage(index)}
              aria-label={t("product.showImage", { label: item.label.toLowerCase() })}
              aria-pressed={item.id === selected.id}
            >
              <span />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
