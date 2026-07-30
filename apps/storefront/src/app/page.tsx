import Link from "next/link";
import { KIKUYU_DELIVERY_FEE_KSH } from "@online-saler/business-rules";
import { StorefrontHeader } from "./storefront-header";
import { StorefrontProductCard } from "./storefront-product-card";
import {
  activeFilterCount,
  fetchPublicProductFilters,
  fetchPublicProducts,
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
  const popularCategories = filters.categories.length
    ? filters.categories.slice(0, 6)
    : ["DRESS", "TOP", "JACKET", "TROUSER", "SKIRT", "KIDS"];

  return (
    <main className="catalog-page">
      <StorefrontHeader searchValue={query.q} />

      <section className="catalog-shell" id="catalog">
        <div className="catalog-title">
          <p>
            <Link href="/">Home</Link>
            <span>/</span>
            <span>All items</span>
          </p>
          <h1>Explore today's finds</h1>
          <span>{products.length} shown / {filters.total} live</span>
        </div>

        <div className="popular-row" aria-label="Popular categories">
          <strong>Popular categories</strong>
          <div>
            {popularCategories.map((category) => (
              <Link href={`/?category=${encodeURIComponent(category)}`} key={category}>
                {display(category)}
              </Link>
            ))}
          </div>
        </div>

        <section className="filter-bar" aria-label="Browse filters">
          <form action="/" className="filter-form" method="get">
            {query.q ? <input name="q" type="hidden" value={query.q} /> : null}
            <FilterSelect name="category" label="Category" value={query.category} options={filters.categories} />
            <FilterSelect name="color" label="Color" value={query.color} options={filters.colors} />
            <FilterSelect name="size" label="Size" value={query.size} options={filters.sizes} />
            <FilterSelect name="audience" label="Audience" value={query.audience} options={filters.audiences} />
            <label className="filter-control">
              <span>Max price</span>
              <input
                inputMode="numeric"
                name="maxPrice"
                defaultValue={query.maxPrice ?? ""}
                placeholder={filters.price.max ? `Up to ${filters.price.max}` : "Any"}
              />
            </label>
            <label className="filter-control sort-control">
              <span>Sort by</span>
              <select name="sort" defaultValue={query.sort ?? "newest"}>
                <option value="newest">Newest</option>
                <option value="price_low">Lowest price</option>
                <option value="price_high">Highest price</option>
              </select>
            </label>
            <button className="filter-submit" type="submit">Apply</button>
            {activeFilters ? <Link className="clear-link" href="/">Clear</Link> : null}
          </form>
        </section>

        <p className="catalog-note">
          Every item is one piece only. Cart does not reserve stock. Local Kikuyu delivery is {KIKUYU_DELIVERY_FEE_KSH} KSh.
        </p>

        {products.length ? (
          <section className="product-grid" aria-label="Published products">
            {products.map((product, index) => (
              <StorefrontProductCard product={product} key={product.id} priority={index < 5} />
            ))}
          </section>
        ) : (
          <section className="empty-store">
            <h2>{activeFilters ? "No matches yet" : "No live items yet"}</h2>
            <p>
              {activeFilters
                ? "Try clearing one or two filters."
                : "Published warehouse-ready products will appear here automatically."}
            </p>
          </section>
        )}
      </section>
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
    <label className="filter-control">
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
