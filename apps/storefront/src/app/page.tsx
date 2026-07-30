import Link from "next/link";
import { KIKUYU_DELIVERY_FEE_KSH } from "@online-saler/business-rules";
import {
  activeFilterCount,
  fetchPublicProductFilters,
  fetchPublicProducts,
  moneyKsh,
  productImageSrc,
  productMeta,
  type PublicProductFilters,
  type PublicProductQuery
} from "./storefront-products";

export const dynamic = "force-dynamic";

type StorefrontHomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StorefrontHome(props: StorefrontHomeProps) {
  const query = queryFromSearchParams((await props.searchParams) ?? {});
  const [products, filters] = await Promise.all([
    fetchPublicProducts(query),
    fetchPublicProductFilters()
  ]);
  const activeFilters = activeFilterCount(query);

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">Online Saler</Link>
        <nav className="nav" aria-label="Storefront navigation">
          <span>New arrivals</span>
          <span>One piece each</span>
          <span>Pickup Kikuyu</span>
          <Link href="/cart">Cart</Link>
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
        <span>{products.length} shown / {filters.total} live</span>
      </section>

      <section className="browse-panel" aria-label="Browse filters">
        <form className="filter-form" action="/" method="get">
          <label>
            <span>Search</span>
            <input name="q" defaultValue={query.q ?? ""} placeholder="Dress, jeans, black..." />
          </label>
          <FilterSelect name="category" label="Category" value={query.category} options={filters.categories} />
          <FilterSelect name="color" label="Color" value={query.color} options={filters.colors} />
          <FilterSelect name="size" label="Size" value={query.size} options={filters.sizes} />
          <FilterSelect name="audience" label="Audience" value={query.audience} options={filters.audiences} />
          <label>
            <span>Max price</span>
            <input
              inputMode="numeric"
              name="maxPrice"
              defaultValue={query.maxPrice ?? ""}
              placeholder={filters.price.max ? `Up to ${filters.price.max}` : "Any"}
            />
          </label>
          <label>
            <span>Sort</span>
            <select name="sort" defaultValue={query.sort ?? "newest"}>
              <option value="newest">Newest</option>
              <option value="price_low">Lowest price</option>
              <option value="price_high">Highest price</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit">Show items</button>
            {activeFilters ? <Link href="/">Clear</Link> : null}
          </div>
        </form>
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
          <h2>{activeFilters ? "No matches yet" : "No live items yet"}</h2>
          <p>
            {activeFilters
              ? "Try clearing filters or checking a broader category."
              : "Published warehouse-ready products will appear here automatically."}
          </p>
        </section>
      )}
    </main>
  );
}

function queryFromSearchParams(params: Record<string, string | string[] | undefined>): PublicProductQuery {
  return {
    q: single(params.q),
    category: single(params.category),
    color: single(params.color),
    size: single(params.size),
    audience: single(params.audience),
    minPrice: single(params.minPrice),
    maxPrice: single(params.maxPrice),
    sort: single(params.sort)
  };
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function FilterSelect(props: {
  name: keyof Pick<PublicProductQuery, "category" | "color" | "size" | "audience">;
  label: string;
  value?: string;
  options: PublicProductFilters[keyof Pick<PublicProductFilters, "categories" | "colors" | "sizes" | "audiences">];
}) {
  return (
    <label>
      <span>{props.label}</span>
      <select name={props.name} defaultValue={props.value ?? ""}>
        <option value="">All</option>
        {props.options.map((option) => (
          <option key={option} value={option}>{display(option)}</option>
        ))}
      </select>
    </label>
  );
}

function display(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
