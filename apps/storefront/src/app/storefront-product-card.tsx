import Link from "next/link";
import {
  moneyKsh,
  productImageSrc,
  type PublicProduct
} from "./storefront-products";

export function StorefrontProductCard({
  product,
  priority = false
}: {
  product: PublicProduct;
  priority?: boolean;
}) {
  const brand = product.brand?.trim() || "Unbranded";
  const title = product.title?.trim() || "Second-hand item";
  const image = productImageSrc(product);
  const size = product.size?.trim() || "Size pending";
  const location = product.onlyOneAvailable ? "Kikuyu pickup" : "Availability check";

  return (
    <article className="product-card">
      <Link className="product-image" href={`/products/${product.id}`} aria-label={`View ${title}`}>
        {image ? (
          <img
            alt={title}
            height={640}
            loading={priority ? "eager" : "lazy"}
            src={image}
            width={640}
          />
        ) : (
          <span>No photo</span>
        )}
      </Link>

      <div className="product-copy">
        <div className="product-brand-row">
          <p>{brand}</p>
          <button aria-label={`Save ${title}`} type="button">Save</button>
        </div>
        <Link className="product-title" href={`/products/${product.id}`}>
          {title}
        </Link>
        <span className="product-size">{size}</span>
        <strong>{moneyKsh(product.priceKsh)}</strong>
        <span className="product-location">{location}</span>
      </div>
    </article>
  );
}
