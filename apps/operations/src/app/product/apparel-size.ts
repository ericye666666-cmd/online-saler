import {
  ADULT_STANDARD_SIZES,
  KIDS_STANDARD_SIZES,
  formatAgeRange,
  formatHeightRange,
  formatWaistSizeLabel,
  formatWeightRange,
  isWaistSizeLabel,
  sizeChartEntry,
  standardSizesForFit,
  usesSizeChart,
  usesWaistSizing,
  waistInchesFrom,
  womenStandardSizeFromUk,
  type SizeChartEntry
} from "@online-saler/business-rules";
import { t } from "@/i18n/runtime";

export { usesWaistSizing };

export function usesApparelSizing(category: string): boolean {
  return usesSizeChart(category);
}

export type ApparelSizeOption = {
  /** Stored in Product.finalSizeLabel. */
  value: string;
  /** What staff read in the dropdown, e.g. "L · UK 14 · 160-170 cm". */
  label: string;
};

export function apparelSizeOptions(category: string, audience: string): ApparelSizeOption[] {
  if (!usesApparelSizing(category) || usesWaistSizing(category, audience)) return [];
  return standardSizesForFit(audience).map((size) => {
    const entry = sizeChartEntry(audience, size);
    return { value: size, label: entry ? optionLabel(entry) : size };
  });
}

function optionLabel(entry: SizeChartEntry): string {
  const age = formatAgeRange(entry);
  return [entry.standardSize, entry.ukSize ?? age, formatHeightRange(entry)].filter(Boolean).join(" · ");
}

/**
 * Fold spellings and legacy labels onto a chart value. Women's UK numbers convert because the
 * chart defines that mapping; no other numeric system is ever guessed into a letter size.
 */
export function normalizeApparelSize(value: string, audience = ""): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  const withoutUk = upper.replace(/^UK[\s:-]+/, "");

  const waist = isWaistSizeLabel(withoutUk) ? formatWaistSizeLabel(withoutUk) : null;
  if (waist) return waist;

  const letters: Record<string, string> = {
    SMALL: "S", MEDIUM: "M", LARGE: "L", "EXTRA LARGE": "XL",
    "EXTRA EXTRA LARGE": "XXL", "2XL": "XXL", "3XL": "XXXL",
    NEWBORN: "BABY", BABY: "BABY"
  };
  const letter = letters[withoutUk] ?? withoutUk;
  if (sizeChartEntry(audience, letter)) return sizeChartEntry(audience, letter)!.standardSize;

  if (audience === "WOMEN") {
    const fromUk = womenStandardSizeFromUk(withoutUk);
    if (fromUk) return fromUk;
  }
  // Unknown audience: keep a plain letter size so a saved draft is not destroyed.
  if (!audience && (ADULT_STANDARD_SIZES as readonly string[]).includes(letter)) return letter;
  return upper;
}

export function isSelectableApparelSize(value: string, category = "", audience = ""): boolean {
  const size = normalizeApparelSize(value, audience);
  if (!size) return false;
  if (category && usesWaistSizing(category, audience)) return waistInchesFrom(size) !== null;
  if (!audience) return (ADULT_STANDARD_SIZES as readonly string[]).includes(size);
  return Boolean(sizeChartEntry(audience, size));
}

/** The derived facts shown under the size field and on the storefront. */
export function apparelSizeSummary(sizeLabel: string, category: string, audience: string): string {
  const size = normalizeApparelSize(sizeLabel, audience);
  if (usesWaistSizing(category, audience)) {
    const inches = waistInchesFrom(size);
    return inches === null ? "" : t("商城显示：Waist {inches}（腰围英寸，不换算字母码）", { inches: inches });
  }
  const entry = sizeChartEntry(audience, size);
  if (!entry) return "";
  const age = formatAgeRange(entry);
  return [
    t("商城显示：{standardSize}{v1}", { standardSize: entry.standardSize, v1: entry.ukSize ? ` · ${entry.ukSize}` : "" }),
    age ? t("年龄 {age}", { age: age }) : null,
    t("身高 {v0}", { v0: formatHeightRange(entry) }),
    t("体重 {v0}", { v0: formatWeightRange(entry) })
  ].filter(Boolean).join(" · ");
}

/** UK size written to Product.ukSizeLabel. Derived, never typed. */
export function derivedUkSizeLabel(sizeLabel: string, category: string, audience: string): string | undefined {
  if (usesWaistSizing(category, audience)) return undefined;
  return sizeChartEntry(audience, normalizeApparelSize(sizeLabel, audience))?.ukSize ?? undefined;
}

/**
 * Kids age ranges read back as the size-chart row they came from.
 *
 * Built on call rather than held in a module constant: these labels are translated, and a constant
 * would freeze whichever language happened to be active when the module first loaded.
 */
export function kidsAgeRangeLabels(): Record<string, string> {
  return {
    NOT_APPLICABLE: t("不适用"),
    ...Object.fromEntries(KIDS_STANDARD_SIZES.map((size) => {
      const entry = sizeChartEntry("KIDS", size)!;
      return [entry.ageRangeCode!, t("{size} · {ageMinYears}-{ageMaxYears} 岁 · {v3}", { size: size, ageMinYears: entry.ageMinYears, ageMaxYears: entry.ageMaxYears, v3: formatHeightRange(entry) })];
    }))
  };
}
