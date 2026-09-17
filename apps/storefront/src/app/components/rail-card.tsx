import Link from "next/link";
import { formatPrice, Product } from "../data/products";
import { optionalBrandValue, optionalDisplayValue, productDisplayTitle } from "../product-detail-commerce";
import { productSizeDisplay } from "../product-size-display";
import { translateValue } from "../../i18n/dictionary";
import type { StorefrontLocale } from "../../i18n/dictionary";

/**
 * A card sized for a horizontal rail: image, name, size, price.
 *
 * Kept free of hooks and server-only calls so both the server-rendered feed
 * and the client-side size picks can render it.
 */
export function RailCard({ product, locale }: { product: Product; locale: StorefrontLocale }) {
  const title = productDisplayTitle(product.title);
  const brandLabel = optionalBrandValue(product.brand);
  const sizeLabel = optionalDisplayValue(translateValue(locale, productSizeDisplay(product).headline));
  return (
    <Link className="homeRailCard" href={`/p/${product.code}`}>
      {product.image ? <img src={product.image} alt={title} loading="lazy" /> : <span className="homeRailNoImage" />}
      {brandLabel ? <span className="homeRailBrand">{brandLabel}</span> : null}
      <strong>{title}</strong>
      {sizeLabel ? <span className="homeRailSize">{sizeLabel}</span> : null}
      <span className="homeRailPrice">{formatPrice(product.price)}</span>
    </Link>
  );
}
