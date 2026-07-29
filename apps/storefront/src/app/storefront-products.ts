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

export type PublicProduct = {
  id: string;
  title: string | null;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  audience: string | null;
  kidsAgeRange: string | null;
  brand: string | null;
  size: string | null;
  conditionGrade: string | null;
  priceKsh: number | null;
  onlyOneAvailable: boolean;
  images: PublicProductImage[];
  measurements: PublicMeasurement[];
  defects: PublicDefect[];
};

const API_PROXY_URL = "/api-proxy";

export function productImageSrc(product: Pick<PublicProduct, "images">): string {
  const first = product.images[0];
  return first?.url ? `${API_PROXY_URL}${first.url}` : "";
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

export async function fetchPublicProducts(apiUrl = process.env.API_URL ?? "http://localhost:4000"): Promise<PublicProduct[]> {
  try {
    const response = await fetch(`${apiUrl}/public/products`, {
      cache: "no-store"
    });
    if (!response.ok) return [];
    const body = (await response.json()) as unknown;
    return Array.isArray(body) ? (body as PublicProduct[]) : [];
  } catch {
    return [];
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
