import Link from "next/link";
import { KIKUYU_DELIVERY_FEE_KSH } from "@online-saler/business-rules";
import {
  fetchPublicProducts,
  moneyKsh,
  productImageSrc,
  productMeta
} from "./storefront-products";

export const dynamic = "force-dynamic";

export default async function StorefrontHome() {
  const products = await fetchPublicProducts();

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">Online Saler</Link>
        <nav className="nav" aria-label="Storefront navigation">
          <span>New arrivals</span>
          <span>One piece each</span>
          <span>Pickup Kikuyu</span>
        </nav>
      </header>

      <section className="storefront-heading">
        <div>
          <h1>Fresh second-hand finds in Kikuyu.</h1>
          <p>
            Every item is photographed, measured, priced, and available as a single piece.
            Pickup is free; local delivery starts at {KIKUYU_DELIVERY_FEE_KSH} KSh.
          </p>
        </div>
        <span>{products.length} live items</span>
      </section>

      {products.length ? (
        <section className="product-grid" aria-label="Published products">
          {products.map((product) => (
            <Link className="product-card" href={`/products/${product.id}`} key={product.id}>
              <div className="product-photo">
                {productImageSrc(product) ? (
                  <img src={productImageSrc(product)} alt={product.title ?? "Second-hand clothing item"} />
                ) : (
                  <span>No photo</span>
                )}
              </div>
              <div className="product-body">
                <div>
                  <h2>{product.title ?? "Second-hand item"}</h2>
                  <p>{productMeta(product)}</p>
                </div>
                <div className="product-footer">
                  <strong>{moneyKsh(product.priceKsh)}</strong>
                  <span>Only one available</span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <section className="empty-store">
          <h2>No live items yet</h2>
          <p>Published warehouse-ready products will appear here automatically.</p>
        </section>
      )}
    </main>
  );
}
