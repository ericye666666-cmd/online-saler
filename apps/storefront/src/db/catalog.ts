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
import { shoeTypes, type Product } from "../app/data/products";
import { classifyProduct } from "../app/shop-taxonomy";
import { formatShoeSizeLabel, isShoeProduct } from "@online-saler/shared-types";
import {
  formatAgeRange,
  formatHeightRange,
  formatWeightRange,
  resolveGarmentSize,
  usesSizeChart,
  usesWaistSizing
} from "@online-saler/business-rules";
import {
  normalizeProductTitle,
  optionalDisplayValue,
  productCopyWithoutPrice,
  publicProductCode,
  sellingPointsWithoutPrice
} from "../app/product-detail-commerce";

const categoryMap: Record<string, string> = {
  DRESS: "Dresses",
  TOP: "Tops",
  JACKET: "Jackets",
  KNITWEAR: "Knitwear",
  TROUSER: "Trousers",
  TROUSERS: "Trousers",
  PANTS: "Trousers",
  SHORT: "Trousers",
  TSHIRTS: "Tops",
  SHIRTS: "Tops",
  BLOUSES: "Tops",
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

export function toCatalogProduct(product: PublicProduct & { detail: NonNullable<PublicProduct["detail"]> }): Product {
  const isShoe = isShoeProduct(product.category, product.subcategory);
  const category = isShoe ? "Shoes" : mapValue(categoryMap, product.category, "Tops");
  const brand = product.brand?.trim() || "Unbranded";
  const frontAsset = detailAsset(product, "FRONT_MAIN");
  const image = frontAsset ? detailAssetSrc(frontAsset) : productImageSrc(product) || "/products/920260718001.webp";
  const condition = mapValue(conditionMap, product.conditionGrade, isShoe ? "Not specified" : "Good");
  const chart = usesSizeChart(product.category)
    ? resolveGarmentSize(product.audience, product.category, product.size)
    : null;
  const size = product.category === "BAG" ? product.size?.trim() || "" : isShoe
    ? formatShoeSizeLabel(product.tagSize || product.size, product.shoeSizeSystem) || "Size not confirmed"
    : chart
      ? chart.waistInches === null ? chart.sizeLabel : `Waist ${chart.waistInches}`
      : (["BAG", "TEXTILE", "OTHERS", "OTHER"].includes(product.category ?? "") ? product.size?.trim() : normalizeApparelSizeLabel(product.size)) || product.kidsAgeRange?.trim() || "Size not confirmed";
  const color = display(product.color ?? "Unknown");

  return {
    code: publicProductCode(product),
    title: normalizeProductTitle(
      brand,
      product.detail.title?.trim() || product.title?.trim() || "Second-hand item"
    ),
    category,
    placements: classifyProduct({ ...product, isShoe }),
    ...(isShoe ? {
      shoeType: shoeTypes.find((type) => type === product.shoeType),
      shoeSizeSystem: product.shoeSizeSystem ?? null,
      tagSize: optionalDisplayValue(product.tagSize),
      shoeConditionNotes: optionalDisplayValue(product.shoeConditionNotes),
      saleUnit: "PAIR" as const
    } : {}),
    brand,
    price: product.priceKsh ?? 0,
    size,
    // Reference-only fit guidance from the size chart; never a guaranteed fit.
    fit: chart && !usesWaistSizing(product.category, product.audience) ? product.audience : null,
    ukSize: chart?.ukSize ?? null,
    recommendedHeight: chart?.entry ? formatHeightRange(chart.entry) : null,
    recommendedWeight: chart?.entry ? formatWeightRange(chart.entry) : null,
    recommendedAge: chart?.entry ? formatAgeRange(chart.entry) : null,
    material: display(product.material || (!isShoe && product.category !== "BAG" && (product.detail.fabricWeight || product.fabricWeight)) || "Not specified"),
    color,
    store: "Kikuyu",
    status: product.availability === "SOLD" ? "Sold" : product.availability === "RESERVED" ? "Reserved" : "Available",
    condition: condition as Product["condition"],
    image,
    ogImage: image,
    description: productCopyWithoutPrice(product.detail.shortDescription) || [
      brand === "Unbranded" ? null : brand,
      category,
      color,
      size,
      "checked in Kikuyu warehouse"
    ].filter(Boolean).join(", "),
    detail: {
      sellingPoints: sellingPointsWithoutPrice(product.detail.sellingPoints),
      measurementSummary: isShoe ? null : optionalDisplayValue(product.detail.measurementSummary),
      conditionSummary: isShoe
        ? optionalDisplayValue(product.shoeConditionNotes) || optionalDisplayValue(product.detail.conditionSummary)
        : product.defects.length ? optionalDisplayValue(product.detail.conditionSummary) : null,
      styleTags: [...new Set([...product.tags.map(display), ...product.detail.styleTags])],
      fitType: !isShoe && product.category !== "BAG" && optionalDisplayValue(product.detail.fitType || product.fitType)
        ? display(product.detail.fitType || product.fitType || "")
        : null,
      stretchLevel: !isShoe && product.category !== "BAG" && optionalDisplayValue(product.detail.stretchLevel || product.stretchLevel)
        ? display(product.detail.stretchLevel || product.stretchLevel || "")
        : null,
      fabricWeight: !isShoe && product.category !== "BAG" && optionalDisplayValue(product.detail.fabricWeight || product.fabricWeight)
        ? display(product.detail.fabricWeight || product.fabricWeight || "")
        : null,
      measurements: isShoe ? product.measurements.filter((measurement) => measurement.type === "INSOLE_LENGTH") : product.measurements,
      defects: product.defects,
      assets: product.detail.assets
        .filter((asset) => !isShoe || asset.type !== "MEASUREMENT_GUIDE")
        .map((asset) => ({ ...asset, image: detailAssetSrc(asset) })),
      sourceImages: product.images
        .filter((image) => (isShoe ? ["FRONT", "BACK", "LABEL", "DETAIL", "DEFECT"] : ["LABEL", "DETAIL", "DEFECT"]).includes(image.type))
        .map((image) => ({ ...image, image: publicProductImageSrc(image) }))
    }
  };
}

/** Standardize equivalent letter labels without converting numeric or legacy sizes. */
function normalizeApparelSizeLabel(value?: string | null): string {
  const original = value?.trim() ?? "";
  const alias = original.toUpperCase().replace(/^UK[\s:-]+/, "").replace(/[\s_-]+/g, "");
  const letterSizes: Record<string, string> = {
    XXS: "XXS", XS: "XS", EXTRASMALL: "XS",
    S: "S", SMALL: "S", M: "M", MEDIUM: "M", L: "L", LARGE: "L",
    XL: "XL", EXTRALARGE: "XL",
    XXL: "XXL", "2XL": "XXL", DOUBLEEXTRALARGE: "XXL",
    XXXL: "XXXL", "3XL": "XXXL", "4XL": "4XL", "5XL": "5XL"
  };
  return letterSizes[alias] ?? original;
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
