"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPrice, Product } from "../data/products";
import { optionalBrandValue, optionalDisplayValue, productDisplayTitle } from "../product-detail-commerce";
import { productSizeDisplay } from "../product-size-display";
import { cardImageSrc } from "../storefront-products";
import { readSavedCodes, subscribeToSaved, toggleSaved } from "../saved-items";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";
import { translateValue } from "../../i18n/dictionary";

export function SavedPageClient({ products }: { products: Product[] }) {
  const { locale, t } = useStorefrontI18n();
  const [codes, setCodes] = useState<string[] | null>(null);

  useEffect(() => {
    const sync = () => setCodes(readSavedCodes());
    sync();
    return subscribeToSaved(sync);
  }, []);

  // null = the list has not been read yet; showing "nothing saved" before that
  // would flash the empty state at someone who has saved plenty.
  if (codes === null) return <p className="savedLoading">{t("common.loading")}</p>;

  const byCode = new Map(products.map((product) => [product.code, product]));
  const savedProducts = codes
    .map((code) => byCode.get(code))
    .filter((product): product is Product => Boolean(product));

  if (savedProducts.length === 0) {
    return (
      <div className="savedEmpty">
        <p className="savedEmptyTitle">{t("saved.empty")}</p>
        <p className="savedEmptyHint">{t("saved.emptyHint")}</p>
        <Link className="savedExplore" href="/">{t("saved.explore")}</Link>
      </div>
    );
  }

  return (
    <ul className="savedList">
      {savedProducts.map((product) => {
        const title = productDisplayTitle(product.title);
        const brandLabel = optionalBrandValue(product.brand);
        const sizeLabel = optionalDisplayValue(translateValue(locale, productSizeDisplay(product).headline));
        return (
          <li key={product.code}>
            <Link className="savedItem" href={`/p/${product.code}`}>
              {product.image ? <img src={cardImageSrc(product.image)} alt={title} loading="lazy" /> : <span className="savedItemNoImage" />}
              <span className="savedItemText">
                <strong>{title}</strong>
                {brandLabel ? <span className="savedItemBrand">{brandLabel}</span> : null}
                {sizeLabel ? <span className="savedItemSize">{sizeLabel}</span> : null}
                <span className="savedItemPrice">{formatPrice(product.price)}</span>
                {product.status !== "Available" ? <span className="savedItemSold">{translateValue(locale, product.status)}</span> : null}
              </span>
            </Link>
            <button
              className="savedRemove"
              type="button"
              onClick={() => {
                toggleSaved(product.code);
                setCodes(readSavedCodes());
              }}
              aria-label={t("catalog.removeSaved", { item: title })}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
