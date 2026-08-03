export type PublicProductImage = {
  id: string;
  type: string;
  url: string;
};

export type PublicMeasurement = {
  type: string;
  valueCm: string | null;
};

export type PublicDefect = {
  type: string;
  severity: string;
  description: string | null;
};

export type PublicProductDetailAsset = {
  id: string;
  type: string;
  url: string;
};

export type PublicProductDetail = {
  profileId: string;
  title: string | null;
  sellingPoints: string[];
  shortDescription: string | null;
  measurementSummary: string | null;
  conditionSummary: string | null;
  styleTags: string[];
  missingInformation: string[];
  warnings: string[];
  fitType: string | null;
  stretchLevel: string | null;
  fabricWeight: string | null;
  assets: PublicProductDetailAsset[];
};

export type PublicProduct = {
  id: string;
  title: string | null;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  audience: string | null;
  kidsAgeRange: string | null;
  brand: string | null;
  material: string | null;
  tags: string[];
  size: string | null;
  conditionGrade: string | null;
  fitType: string | null;
  stretchLevel: string | null;
  fabricWeight: string | null;
  priceKsh: number | null;
  onlyOneAvailable: boolean;
  images: PublicProductImage[];
  measurements: PublicMeasurement[];
  defects: PublicDefect[];
  detail?: PublicProductDetail | null;
};

export type PublicProductFilters = {
  categories: string[];
  colors: string[];
  sizes: string[];
  audiences: string[];
  price: {
    min: number | null;
    max: number | null;
  };
  total: number;
};

export type PublicProductQuery = {
  category?: string;
  color?: string;
  size?: string;
  audience?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  q?: string;
};

const API_PROXY_URL = "/api-proxy";

export function productImageSrc(product: Pick<PublicProduct, "images">): string {
  const first = product.images[0];
  return first ? publicProductImageSrc(first) : "";
}

export function publicProductImageSrc(image: PublicProductImage): string {
  if (!image.url) return "";
  return image.url.startsWith("http") ? image.url : `${API_PROXY_URL}${image.url}`;
}

export function detailAssetSrc(asset: PublicProductDetailAsset): string {
  if (!asset.url) return "";
  return asset.url.startsWith("http") ? asset.url : `${API_PROXY_URL}${asset.url}`;
}

export function detailAsset(product: Pick<PublicProduct, "detail">, type: string): PublicProductDetailAsset | null {
  return product.detail?.assets.find((asset) => asset.type === type) ?? null;
}

export function hasApprovedPublicDetail(
  product: PublicProduct
): product is PublicProduct & { detail: PublicProductDetail } {
  return Boolean(product.detail?.profileId);
}

export function moneyKsh(value: number | null): string {
  if (!value || value <= 0) return "Price pending";
  return `KSh ${value.toLocaleString("en-KE")}`;
}

export function productMeta(product: PublicProduct): string {
  return [product.category, product.subcategory, product.color, product.size]
    .filter(Boolean)
    .join(" / ");
}

export function publicProductQueryString(query: PublicProductQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value?.trim()) params.set(key, value.trim());
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function activeFilterCount(query: PublicProductQuery): number {
  return ["category", "color", "size", "audience", "minPrice", "maxPrice", "q"]
    .filter((key) => Boolean(query[key as keyof PublicProductQuery]?.trim()))
    .length;
}

export async function fetchPublicProducts(
  query: PublicProductQuery = {},
  apiUrl = process.env.API_URL ?? "http://localhost:4000"
): Promise<PublicProduct[]> {
  try {
    const response = await fetch(`${apiUrl}/public/products${publicProductQueryString(query)}`, {
      cache: "no-store"
    });
    if (!response.ok) return [];
    const body = (await response.json()) as unknown;
    return Array.isArray(body) ? (body as PublicProduct[]) : [];
  } catch {
    return [];
  }
}

export async function fetchPublicProductFilters(apiUrl = process.env.API_URL ?? "http://localhost:4000"): Promise<PublicProductFilters> {
  try {
    const response = await fetch(`${apiUrl}/public/products/filters`, {
      cache: "no-store"
    });
    if (!response.ok) return emptyFilters();
    return (await response.json()) as PublicProductFilters;
  } catch {
    return emptyFilters();
  }
}

export async function fetchPublicProduct(id: string, apiUrl = process.env.API_URL ?? "http://localhost:4000"): Promise<PublicProduct | null> {
  try {
    const response = await fetch(`${apiUrl}/public/products/${encodeURIComponent(id)}`, {
      cache: "no-store"
    });
    if (!response.ok) return null;
    return (await response.json()) as PublicProduct;
  } catch {
    return null;
  }
}

function emptyFilters(): PublicProductFilters {
  return {
    categories: [],
    colors: [],
    sizes: [],
    audiences: [],
    price: {
      min: null,
      max: null
    },
    total: 0
  };
}
