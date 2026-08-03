import {
  detailAsset,
  detailAssetSrc,
  fetchPublicProduct,
  fetchPublicProducts,
  hasApprovedPublicDetail,
  productImageSrc,
  publicProductImageSrc,
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
  return products.filter(hasApprovedPublicDetail).map(toCatalogProduct);
}

export async function getPublishedProduct(code: string): Promise<Product | null> {
  const product = await fetchPublicProduct(code);
  return product && hasApprovedPublicDetail(product) ? toCatalogProduct(product) : null;
}

function toCatalogProduct(product: PublicProduct & { detail: NonNullable<PublicProduct["detail"]> }): Product {
  const category = mapValue(categoryMap, product.category, "Tops");
  const brand = product.brand?.trim() || "Unbranded";
  const frontAsset = detailAsset(product, "FRONT_MAIN");
  const image = frontAsset ? detailAssetSrc(frontAsset) : productImageSrc(product) || "/products/920260718001.webp";
  const condition = mapValue(conditionMap, product.conditionGrade, "Good");
  const size = product.size?.trim() || product.kidsAgeRange?.trim() || "M";
  const color = display(product.color ?? "Unknown");

  return {
    code: product.id,
    title: product.detail.title?.trim() || product.title?.trim() || "Second-hand item",
    category,
    brand,
    price: product.priceKsh ?? 0,
    size,
    material: display(product.material || product.detail.fabricWeight || product.fabricWeight || "Not specified"),
    color,
    store: "Kikuyu",
    status: "Available",
    condition: condition as Product["condition"],
    image,
    ogImage: image,
    description: product.detail.shortDescription?.trim() || [
      brand === "Unbranded" ? null : brand,
      category,
      color,
      size,
      "checked in Kikuyu warehouse"
    ].filter(Boolean).join(", "),
    detail: {
      sellingPoints: product.detail.sellingPoints,
      measurementSummary: product.detail.measurementSummary ?? "",
      conditionSummary: product.detail.conditionSummary ?? "",
      styleTags: [...new Set([...product.tags.map(display), ...product.detail.styleTags])],
      missingInformation: product.detail.missingInformation,
      warnings: product.detail.warnings,
      fitType: display(product.detail.fitType || product.fitType || "Not confirmed"),
      stretchLevel: display(product.detail.stretchLevel || product.stretchLevel || "Not confirmed"),
      fabricWeight: display(product.detail.fabricWeight || product.fabricWeight || "Not confirmed"),
      measurements: product.measurements,
      defects: product.defects,
      assets: product.detail.assets.map((asset) => ({ ...asset, image: detailAssetSrc(asset) })),
      sourceImages: product.images
        .filter((image) => ["LABEL", "DETAIL", "DEFECT"].includes(image.type))
        .map((image) => ({ ...image, image: publicProductImageSrc(image) }))
    }
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
