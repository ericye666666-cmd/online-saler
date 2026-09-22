import type { Product } from "./data/products";
import { onChosenShelf } from "./shop-taxonomy";

export type CatalogFilters = Partial<Record<
  "department" | "group" | "shopCategory" | "brand" | "color" | "material" | "store" | "size" | "condition" | "price" | "query" | "sort",
  string
>> & { availableOnly?: boolean };

/** Whether a product is shelved in a department / group / category; "All" matches everything below it. */
export function inPlacement(product: Product, department = "All", shopCategory = "All", group = "All"): boolean {
  return onChosenShelf(product.placements, department, group, shopCategory);
}

export function catalogSizeOptions(products: Product[], department: string, shopCategory = "All", group = "All"): string[] {
  const sizes = products
    .filter((product) => inPlacement(product, department, shopCategory, group))
    .map((product) => product.size)
    .filter((size) => size && size !== "Size not confirmed");
  const letterOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL"];
  const sorted = [...new Set(sizes)].sort((left, right) => {
    const leftRank = letterOrder.indexOf(left);
    const rightRank = letterOrder.indexOf(right);
    if (leftRank >= 0 || rightRank >= 0) {
      return (leftRank < 0 ? letterOrder.length : leftRank) - (rightRank < 0 ? letterOrder.length : rightRank);
    }
    return left.localeCompare(right, "en", { numeric: true });
  });
  return ["All", ...sorted];
}

export function filterCatalogProducts(products: Product[], filters: CatalogFilters): Product[] {
  const normalizedQuery = filters.query?.trim().toLowerCase();
  const matches = products.filter((product) => {
    const matchesQuery = !normalizedQuery || [
      product.title, product.category, product.brand, product.shoeType, product.size, product.material, product.color, product.code,
      ...(product.placements ?? []).map((placement) => placement.category),
    ].join(" ").toLowerCase().includes(normalizedQuery);
    const price = filters.price ?? "All";
    const matchesPrice = price === "All"
      || (price === "Under KSh 500" && product.price < 500)
      || (price === "KSh 500–799" && product.price >= 500 && product.price < 800)
      || (price === "KSh 800+" && product.price >= 800);
    const fields = ["brand", "color", "material", "store", "size", "condition"] as const;
    return matchesQuery && matchesPrice
      && inPlacement(product, filters.department ?? "All", filters.shopCategory ?? "All", filters.group ?? "All")
      && fields.every((field) => !filters[field] || filters[field] === "All" || product[field] === filters[field])
      && (!filters.availableOnly || product.status === "Available");
  });
  const statusRank = (product: Product) => product.status === "Available" ? 0 : product.status === "Reserved" ? 1 : 2;
  return matches.sort((left, right) => statusRank(left) - statusRank(right)
    || (filters.sort === "Price: low to high" ? left.price - right.price
      : filters.sort === "Price: high to low" ? right.price - left.price : 0));
}
