import { apparelSizes, type Product } from "./data/products";

export type CatalogFilters = Partial<Record<
  "category" | "brand" | "color" | "material" | "store" | "shoeType" | "bagType" | "textileType" | "size" | "condition" | "price" | "query" | "sort",
  string
>> & { availableOnly?: boolean };

export function catalogSizeOptions(products: Product[], category: string): string[] {
  const sizes = products
    .filter((product) => category === "All" || product.category === category)
    .map((product) => product.size)
    .filter((size) => size && size !== "Size not confirmed");
  const defaults = category === "Shoes" ? [] : apparelSizes.filter((size) => size !== "All");
  return ["All", ...new Set([...defaults, ...sizes].sort((left, right) => left.localeCompare(right, "en", { numeric: true })))];
}

export function filterCatalogProducts(products: Product[], filters: CatalogFilters): Product[] {
  const normalizedQuery = filters.query?.trim().toLowerCase();
  const matches = products.filter((product) => {
    const matchesQuery = !normalizedQuery || [
      product.title, product.category, product.brand, product.bagType, product.textileType,
      product.shoeType, product.size, product.material, product.color, product.code,
    ].join(" ").toLowerCase().includes(normalizedQuery);
    const price = filters.price ?? "All";
    const matchesPrice = price === "All"
      || (price === "Under KSh 500" && product.price < 500)
      || (price === "KSh 500–799" && product.price >= 500 && product.price < 800)
      || (price === "KSh 800+" && product.price >= 800);
    const fields = ["category", "brand", "color", "material", "store", "shoeType", "bagType", "textileType", "size", "condition"] as const;
    return matchesQuery && matchesPrice
      && fields.every((field) => !filters[field] || filters[field] === "All" || product[field] === filters[field])
      && (!filters.availableOnly || product.status === "Available");
  });
  const statusRank = (product: Product) => product.status === "Available" ? 0 : product.status === "Reserved" ? 1 : 2;
  return matches.sort((left, right) => statusRank(left) - statusRank(right)
    || (filters.sort === "Price: low to high" ? left.price - right.price
      : filters.sort === "Price: high to low" ? right.price - left.price : 0));
}
