import type { Metadata } from "next";
import { formatPrice, normalizeSellerRef, Product, productShareCopy, SHARE_CARD_VERSION, SITE_URL } from "./data/products";

export function productShareMetadata(product: Product, ref?: string, recommender?: string | null): Metadata {
  const { title, description } = productShareCopy(product, recommender);
  const url = new URL(`/p/${encodeURIComponent(product.code)}`, SITE_URL);
  const sellerRef = normalizeSellerRef(ref);
  // Preserve the recommender in the preview identity; keep SEO canonical unpersonalized.
  if (sellerRef) url.searchParams.set("ref", sellerRef);
  url.searchParams.set("card", SHARE_CARD_VERSION);
  const image = new URL(`/p/${encodeURIComponent(product.code)}/share-image?v=${SHARE_CARD_VERSION}`, SITE_URL).toString();
  return {
    title: `${product.title} · ${formatPrice(product.price)}`,
    description,
    alternates: { canonical: `/p/${product.code}` },
    openGraph: {
      title, description, url: url.toString(), siteName: "Direct Loop", type: "website",
      images: [{ url: image, width: 1200, height: 1200, type: "image/jpeg", alt: product.title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
