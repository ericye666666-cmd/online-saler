import type { PublicProduct } from "./storefront-products";
import type { Product as CatalogProduct } from "./data/products";

export const CART_STORAGE_KEY = "online-saler-cart-v1";
export const CART_STORAGE_VERSION = 1;

export type CartItem = {
  productId: string;
  title: string;
  priceKsh: number | null;
  imageUrl: string | null;
  meta: string;
};

export type CartSnapshot = {
  version: typeof CART_STORAGE_VERSION;
  item: CartItem | null;
  updatedAt: string;
};

export function productToCartItem(product: PublicProduct): CartItem {
  return {
    productId: product.id,
    title: product.title ?? "Second-hand item",
    priceKsh: product.priceKsh,
    imageUrl: product.images[0]?.url ?? null,
    meta: [product.category, product.color, product.size].filter(Boolean).join(" / ")
  };
}

export function catalogProductToCartItem(product: CatalogProduct): CartItem {
  return {
    productId: product.code,
    title: product.title,
    priceKsh: product.price,
    imageUrl: product.image,
    meta: [product.category, product.color, product.size].filter(Boolean).join(" / ")
  };
}

export function createCartSnapshot(item: CartItem, updatedAt = new Date().toISOString()): CartSnapshot {
  return {
    version: CART_STORAGE_VERSION,
    item,
    updatedAt
  };
}

export function cartSubtotalKsh(snapshot: CartSnapshot | null): number {
  return snapshot?.item?.priceKsh && snapshot.item.priceKsh > 0 ? snapshot.item.priceKsh : 0;
}

export function parseCartSnapshot(value: string | null): CartSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CartSnapshot>;
    if (parsed.version !== CART_STORAGE_VERSION || !parsed.item?.productId) return null;
    return {
      version: CART_STORAGE_VERSION,
      item: parsed.item,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString()
    };
  } catch {
    return null;
  }
}
