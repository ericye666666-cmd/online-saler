import {
  fetchPublicProduct,
  fetchPublicProducts,
  productImageSrc,
  type PublicProduct
} from "../app/storefront-products";
import type { Product } from "../app/data/products";

const categoryMap: Record<string, string> = {
  DRESS: "Dresses",
  TOP: "Tops",
  JACKET: "Jackets",
  KNITWEAR: "Knitwear",
  TROUSER: "Trousers",
  TROUSERS: "Trousers",
  SKIRT: "Skirts",
  BAG: "Bags",
  BAGS: "Bags",
  SHOE: "Shoes",
  SHOES: "Shoes",
  HOME_TEXTILES: "Home Textiles"
};

const conditionMap: Record<string, string> = {
  LIKE_NEW: "Like new",
  EXCELLENT: "Very good",
  GOOD: "Good",
  FAIR: "Fair"
};

export async function listPublishedProducts(): Promise<Product[]> {
  const products = await fetchPublicProducts();
  return products.map(toCatalogProduct);
}

export async function getPublishedProduct(code: string): Promise<Product | null> {
  const product = await fetchPublicProduct(code);
  return product ? toCatalogProduct(product) : null;
}

function toCatalogProduct(product: PublicProduct): Product {
  const category = mapValue(categoryMap, product.category, "Tops");
  const brand = product.brand?.trim() || "Unbranded";
  const image = productImageSrc(product) || "/products/920260718001.webp";
  const condition = mapValue(conditionMap, product.conditionGrade, "Good");
  const size = product.size?.trim() || product.kidsAgeRange?.trim() || "M";
  const color = display(product.color ?? "Unknown");

  return {
    code: product.id,
    title: product.title?.trim() || "Second-hand item",
    category,
    brand,
    price: product.priceKsh ?? 0,
    size,
    material: "Second-hand fabric",
    color,
    store: "Kikuyu",
    status: "Available",
    condition: condition as Product["condition"],
    image,
    ogImage: image,
    description: [
      brand === "Unbranded" ? null : brand,
      category,
      color,
      size,
      "checked in Kikuyu warehouse"
    ].filter(Boolean).join(", ")
  };
}

function mapValue(map: Record<string, string>, value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  return map[value] ?? display(value);
}

function display(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
