import type { Product } from "./data/products";
import { translateValue, type StorefrontLocale } from "../i18n/dictionary";

export type ProductSizeDisplay = {
  /** Sits next to the price: "L · UK 14", "XL · UK 46-48", "M · Unisex", "M · Kids". */
  headline: string;
  /** Unisex only — men's and women's UK sizes are already in the headline. */
  ukEquivalent: string | null;
  /** Kids only. */
  age: string | null;
  /** "160-170 cm · 58-70 kg", reference only. */
  recommendation: string | null;
};

/**
 * Second-hand stock varies by brand and cut, so these lines are a fit hint. They never
 * claim the garment fits that body — the copy around them says so.
 */
export function productSizeDisplay(product: Product): ProductSizeDisplay {
  const fit = product.fit ?? null;
  const uk = product.ukSize ?? null;
  const height = product.recommendedHeight ?? null;
  const weight = product.recommendedWeight ?? null;

  return {
    headline: [product.size, fitSuffix(fit, uk)].filter(Boolean).join(" · "),
    ukEquivalent: fit === "UNISEX" && uk ? uk.replace(/^UK\s*/, "") : null,
    age: product.recommendedAge ?? null,
    recommendation: height && weight ? `${height} · ${weight}` : null
  };
}

/** The headline in the shopper's language: each " · " part is translated on its own ("M · 中性"). */
export function localizedSizeHeadline(locale: StorefrontLocale, product: Product): string {
  return productSizeDisplay(product).headline.split(" · ").map((part) => translateValue(locale, part)).join(" · ");
}

function fitSuffix(fit: string | null, uk: string | null): string | null {
  if (fit === "MEN" || fit === "WOMEN") return uk;
  if (fit === "UNISEX") return "Unisex";
  if (fit === "KIDS") return "Kids";
  return null;
}
