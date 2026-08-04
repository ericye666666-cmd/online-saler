import type { PublicProduct } from "./storefront-products";
import type { Product as CatalogProduct } from "./data/products";

export const CART_STORAGE_KEY = "online-saler-cart-v1";
export const CART_STORAGE_VERSION = 1;
export const CART_UPDATED_EVENT = "online-saler-cart-updated";
export const CART_MAX_ITEMS = 10;

export type CartItem = {
  productId: string;
  addedAt: string;
};

export type CartSnapshot = {
  version: typeof CART_STORAGE_VERSION;
  items: CartItem[];
  updatedAt: string;
};

export function productToCartItem(product: PublicProduct): CartItem {
  return {
    productId: product.id,
    addedAt: new Date().toISOString()
  };
}

export function catalogProductToCartItem(product: CatalogProduct): CartItem {
  return {
    productId: product.code,
    addedAt: new Date().toISOString()
  };
}

export function createCartSnapshot(items: CartItem | CartItem[] = [], updatedAt = new Date().toISOString()): CartSnapshot {
  const normalizedItems = Array.isArray(items) ? items : [items];
  return {
    version: CART_STORAGE_VERSION,
    items: dedupeItems(normalizedItems).slice(0, CART_MAX_ITEMS),
    updatedAt
  };
}

export function addCartItem(snapshot: CartSnapshot | null, item: CartItem, updatedAt = new Date().toISOString()): CartSnapshot {
  const existing = snapshot?.items ?? [];
  return createCartSnapshot([...existing, item], updatedAt);
}

export function removeCartItem(snapshot: CartSnapshot | null, productId: string, updatedAt = new Date().toISOString()): CartSnapshot {
  return createCartSnapshot((snapshot?.items ?? []).filter((item) => item.productId !== productId), updatedAt);
}

export function cartProductIds(snapshot: CartSnapshot | null): string[] {
  return snapshot?.items.map((item) => item.productId) ?? [];
}

export function cartItemCount(snapshot: CartSnapshot | null): number {
  return snapshot?.items.length ?? 0;
}

export function cartSubtotalKsh(items: Array<{ priceKsh: number | null; canCheckout?: boolean }> | null): number {
  return (items ?? []).reduce((sum, item) => {
    if (item.canCheckout === false) return sum;
    return item.priceKsh && item.priceKsh > 0 ? sum + item.priceKsh : sum;
  }, 0);
}

export function notifyCartUpdated() {
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function parseCartSnapshot(value: string | null): CartSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CartSnapshot> & { item?: Partial<CartItem> | null };
    if (parsed.version !== CART_STORAGE_VERSION) return null;
    const legacyItem = parsed.item?.productId
      ? [{ productId: parsed.item.productId, addedAt: parsed.item.addedAt ?? parsed.updatedAt ?? new Date(0).toISOString() }]
      : [];
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((item): item is CartItem => Boolean(item?.productId))
          .map((item) => ({ productId: item.productId, addedAt: item.addedAt ?? parsed.updatedAt ?? new Date(0).toISOString() }))
      : legacyItem;
    if (!items.length) return null;
    return createCartSnapshot(items, parsed.updatedAt ?? new Date(0).toISOString());
  } catch {
    return null;
  }
}

function dedupeItems(items: CartItem[]): CartItem[] {
  const seen = new Set<string>();
  const deduped: CartItem[] = [];
  for (const item of items) {
    const productId = item.productId.trim();
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    deduped.push({
      productId,
      addedAt: item.addedAt || new Date().toISOString()
    });
  }
  return deduped;
}
