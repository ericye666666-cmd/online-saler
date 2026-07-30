import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "../../cart-actions";
import { StorefrontHeader } from "../../storefront-header";
import {
  fetchPublicProduct,
  moneyKsh,
  productImageSrc,
  productMeta
} from "../../storefront-products";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProductPage(props: ProductPageProps) {
  const { id } = await props.params;
  const product = await fetchPublicProduct(id);
  if (!product) notFound();

  return (
    <main className="catalog-page">
      <StorefrontHeader />

      <div className="detail-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href={`/?category=${encodeURIComponent(product.category ?? "")}`}>
            {display(product.category ?? "Items")}
          </Link>
          <span>/</span>
          <span>{product.title ?? "Second-hand item"}</span>
        </nav>

        <article className="detail-layout">
          <div className="detail-gallery">
            <div className="thumbnail-rail" aria-label="Product image thumbnails">
              <button className="active" type="button">
                {productImageSrc(product) ? <img src={productImageSrc(product)} alt="" /> : <span>No photo</span>}
              </button>
            </div>
            <div className="detail-photo">
              {productImageSrc(product) ? (
                <img src={productImageSrc(product)} alt={product.title ?? "Second-hand clothing item"} />
              ) : (
                <span>No photo</span>
              )}
            </div>
          </div>

          <section className="detail-panel">
            <div className="title-and-status">
              <div>
                <p className="detail-brand">{product.brand?.trim() || "Unbranded"}</p>
                <h1>{product.title ?? "Second-hand item"}</h1>
                <strong className="detail-price">{moneyKsh(product.priceKsh)}</strong>
              </div>
              <span className="detail-status">Available</span>
            </div>

            <p className="product-description">
              {productMeta(product) || "Measured and checked in Kikuyu warehouse."}
            </p>

            <div className="detail-section">
              <h2>Fit and condition</h2>
              <dl className="spec-list">
                <div><dt>Size</dt><dd>{product.size ?? "-"}</dd></div>
                <div><dt>Condition</dt><dd>{display(product.conditionGrade ?? "-")}</dd></div>
                <div><dt>Audience</dt><dd>{display(product.audience ?? "-")}</dd></div>
                <div><dt>Brand</dt><dd>{product.brand ?? "Unbranded"}</dd></div>
                <div><dt>Colour</dt><dd>{display(product.color ?? "-")}</dd></div>
                <div><dt>Pickup</dt><dd>Kikuyu</dd></div>
              </dl>
            </div>

            <div className="detail-section">
              <h2>Measurements</h2>
              {product.measurements.length ? (
                <dl className="spec-list">
                  {product.measurements.map((measurement) => (
                    <div key={measurement.type}>
                      <dt>{display(measurement.type)}</dt>
                      <dd>{measurement.valueCm ? `${measurement.valueCm} cm` : "-"}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="muted">Measurements are being checked.</p>
              )}
            </div>

            <div className="detail-section">
              <h2>Defects</h2>
              {product.defects.length ? (
                <ul className="defect-list">
                  {product.defects.map((defect) => (
                    <li key={`${defect.type}-${defect.description ?? ""}`}>
                      {display(defect.type)}: {defect.description ?? display(defect.severity)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No major defects listed.</p>
              )}
            </div>

            <AddToCartButton product={product} />
            <p className="checkout-note">Cart does not reserve this item. Stock is checked again before payment.</p>
          </section>
        </article>
      </div>
    </main>
  );
}

function display(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
