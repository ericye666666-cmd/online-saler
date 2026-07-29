import Link from "next/link";
import { notFound } from "next/navigation";
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
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">Online Saler</Link>
        <nav className="nav" aria-label="Storefront navigation">
          <Link href="/">New arrivals</Link>
          <span>Pickup Kikuyu</span>
        </nav>
      </header>

      <article className="detail-layout">
        <div className="detail-photo">
          {productImageSrc(product) ? (
            <img src={productImageSrc(product)} alt={product.title ?? "Second-hand clothing item"} />
          ) : (
            <span>No photo</span>
          )}
        </div>

        <section className="detail-panel">
          <p className="detail-meta">{productMeta(product)}</p>
          <h1>{product.title ?? "Second-hand item"}</h1>
          <strong className="detail-price">{moneyKsh(product.priceKsh)}</strong>
          <p className="availability">Only one available</p>

          <div className="detail-section">
            <h2>Fit and condition</h2>
            <dl className="spec-list">
              <div>
                <dt>Size</dt>
                <dd>{product.size ?? "-"}</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{product.conditionGrade ?? "-"}</dd>
              </div>
              <div>
                <dt>Audience</dt>
                <dd>{product.audience ?? "-"}</dd>
              </div>
              <div>
                <dt>Brand</dt>
                <dd>{product.brand ?? "-"}</dd>
              </div>
            </dl>
          </div>

          <div className="detail-section">
            <h2>Measurements</h2>
            {product.measurements.length ? (
              <dl className="spec-list">
                {product.measurements.map((measurement) => (
                  <div key={measurement.type}>
                    <dt>{label(measurement.type)}</dt>
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
                    {label(defect.type)}: {defect.description ?? defect.severity}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No major defects listed.</p>
            )}
          </div>

          <button className="reserve-button" type="button" disabled>
            Checkout coming next
          </button>
        </section>
      </article>
    </main>
  );
}

function label(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
