export const APPAREL_LETTER_SIZES = ["S", "M", "L", "XL", "XXL"] as const;

export function usesApparelSizing(category: string): boolean {
  return ["KIDS", "PANTS", "JACKETS", "DRESSES", "LADY_TOPS", "SHIRTS", "TSHIRTS", "SHORT", "TWO_PIECE"].includes(category);
}

/** Normalize spelling only. Never infer a UK size from another numeric system. */
export function normalizeApparelSize(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const upper = trimmed.toUpperCase();
  const letters: Record<string, string> = {
    SMALL: "S", MEDIUM: "M", LARGE: "L", "EXTRA LARGE": "XL",
    "EXTRA EXTRA LARGE": "XXL", "2XL": "XXL"
  };
  const candidate = upper.replace(/^UK\s+/, "");
  const letter = letters[candidate] ?? candidate;
  if ((APPAREL_LETTER_SIZES as readonly string[]).includes(letter)) return letter;
  return /^UK\s/i.test(trimmed) ? upper : trimmed;
}

export function isSelectableApparelSize(value: string): boolean {
  const size = normalizeApparelSize(value);
  if ((APPAREL_LETTER_SIZES as readonly string[]).includes(size)) return true;
  // Explicit UK numeric, waist, or age label. These are input formats, not conversion tables.
  return /^UK (?:\d{1,2}(?:\.5)?(?:[-/]\d{1,2}(?:\.5)?)?|W\d{2}(?:\s*L\d{2})?|\d{1,2}(?:-\d{1,2})?[MY]|NEWBORN)$/.test(size);
}
