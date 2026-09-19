import Link from "next/link";
import { formatPrice, Product } from "../data/products";
import { optionalBrandValue, optionalDisplayValue, productDisplayTitle } from "../product-detail-commerce";
import { localizedSizeHeadline } from "../product-size-display";
import { cardImageSrc } from "../storefront-products";
import type { StorefrontLocale } from "../../i18n/dictionary";
import { RailSaveButton } from "./rail-save-button";

/**
 * A card sized for a horizontal rail: image, name, size, price.
 *
 * Kept free of hooks and server-only calls so both the server-rendered feed
 * and the client-side size picks can render it.
 */
export function RailCard({ product, locale, href }: { product: Product; locale: StorefrontLocale; href?: string }) {
  const title = productDisplayTitle(product.title);
  const brandLabel = optionalBrandValue(product.brand);
  const sizeLabel = optionalDisplayValue(localizedSizeHeadline(locale, product));
  return (
    <div className="homeRailCard">
      <Link className="homeRailLink" href={href ?? `/p/${product.code}`}>
        {product.image ? <img src={cardImageSrc(product.image)} alt={title} loading="lazy" /> : <span className="homeRailNoImage" />}
        {brandLabel ? <span className="homeRailBrand">{brandLabel}</span> : null}
        <strong>{title}</strong>
        {sizeLabel ? <span className="homeRailSize">{sizeLabel}</span> : null}
        <span className="homeRailPrice">{formatPrice(product.price)}</span>
      </Link>
      <RailSaveButton productCode={product.code} productTitle={title} />
    </div>
  );
}
