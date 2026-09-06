/** A shoe product is one matching pair, with the original label retained in tagSize. */
export const SHOE_SIZE_SYSTEMS = ["EU", "UK", "US_MEN", "US_WOMEN", "US_KIDS", "CM", "OTHER"] as const;
export type ShoeSizeSystem = typeof SHOE_SIZE_SYSTEMS[number];

export const SHOE_TYPES = [
  "Sneakers", "Sports shoes", "High heels", "Leather shoes", "Boots", "Loafers",
  "Flats", "Sandals", "Slippers", "Kids' shoes", "Other"
] as const;
export type ShoeType = typeof SHOE_TYPES[number];

/** Existing original-image slots: pair overview, side, soles, size label. */
export const SHOE_REQUIRED_IMAGE_TYPES = ["FRONT", "BACK", "DETAIL", "LABEL"] as const;

export function isShoeCategory(category?: string | null): boolean {
  return ["SHOE", "SHOES"].includes(String(category ?? "").trim().toUpperCase());
}

/** Includes older records whose shoe subcategory was saved under an audience category. */
export function isShoeProduct(category?: string | null, subcategory?: string | null): boolean {
  return isShoeCategory(category) || String(subcategory ?? "").trim().toUpperCase().endsWith("_SHOES");
}

const SIZE_PREFIXES: Record<ShoeSizeSystem, string> = {
  EU: "EU", UK: "UK", US_MEN: "US Men", US_WOMEN: "US Women", US_KIDS: "US Kids", CM: "CM", OTHER: ""
};

/** Format a confirmed label; never infer or convert a shoe size from age or measurements. */
export function formatShoeSizeLabel(tagSize?: string | null, system?: string | null): string | null {
  const original = typeof tagSize === "string" ? tagSize.trim() : "";
  if (!original || original.length > 80 || !/\d/.test(original) || !SHOE_SIZE_SYSTEMS.includes(system as ShoeSizeSystem)) return null;
  if (/\b(?:unknown|unreadable|unconfirmed|not\s+known|estimated)\b/i.test(original)) return null;
  const sizeSystem = system as ShoeSizeSystem;
  if (sizeSystem === "OTHER") return original;
  const prefix = SIZE_PREFIXES[sizeSystem];
  const labelled = original.match(/^(EUR?|UK|CM|US(?:A)?(?:[ _-]*(?:MEN|WOMEN|KIDS|M|W|K))?)\s*[:=-]?\s*(.+)$/i);
  if (labelled) {
    const compact = labelled[1].toUpperCase().replace(/[ _-]+/g, "").replace(/^USA/, "US");
    const existing = ({ EUR: "EU", USMEN: "US_MEN", USM: "US_MEN", USWOMEN: "US_WOMEN", USW: "US_WOMEN", USKIDS: "US_KIDS", USK: "US_KIDS" } as Record<string, string>)[compact] ?? compact;
    if (existing !== sizeSystem && !(existing === "US" && sizeSystem.startsWith("US_"))) return null;
    if (/^(?:EUR?|UK|CM|US)\s*[\dA-Z]/i.test(labelled[2])) return null;
    return `${prefix} ${labelled[2].trim()}`;
  }
  const suffix = original.match(/^(.+?)\s+(EUR?|UK|CM)$/i);
  if (suffix) return suffix[2].toUpperCase().replace("EUR", "EU") === sizeSystem ? `${prefix} ${suffix[1].trim()}` : null;
  return `${prefix} ${original}`;
}
