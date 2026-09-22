/**
 * Run-through ("过款") videos: which pieces a video shows, and the caption that
 * goes with it.
 *
 * Eight pieces at 1.2 s each make a video of about 12 s: short enough that
 * most viewers watch to the end, long enough to show a real choice.
 *
 * Every affiliate draws from the same stock, so pieces are picked by how
 * rarely they have been shown: across all affiliates first, then by this
 * affiliate, then newest first. Ties are broken at random, which also means
 * two affiliates generating on the same day get different pieces in a
 * different order, so TikTok does not see the same video posted twice.
 */

export const RUN_THROUGH_ITEM_COUNT = 8;
export const RUN_THROUGH_MIN_ITEMS = 4;
export const RUN_THROUGH_ALL_CATEGORIES = "ALL";

export type RunThroughCandidate = {
  id: string;
  publishedAt: Date | null;
  timesShown: number;
  timesShownByAffiliate: number;
};

export function selectRunThroughProducts<T extends RunThroughCandidate>(
  candidates: T[],
  count: number = RUN_THROUGH_ITEM_COUNT,
  random: () => number = Math.random,
): T[] {
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  // Array.prototype.sort is stable, so the shuffle decides every tie.
  return shuffled
    .sort((a, b) =>
      a.timesShown - b.timesShown
      || a.timesShownByAffiliate - b.timesShownByAffiliate
      || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, count);
}

const CATEGORY_LABELS: Record<string, string> = {
  TSHIRTS: "T-Shirts",
  SHIRTS: "Shirts",
  LADY_TOPS: "Tops",
  DRESSES: "Dresses",
  JACKETS: "Jackets",
  PANTS: "Trousers",
  SHORT: "Shorts",
  TWO_PIECE: "Two-piece sets",
  SHOES: "Shoes",
  BAG: "Bags",
  KIDS: "Kids",
};

export function runThroughCategoryLabel(category: string | null | undefined): string {
  if (!category || category === RUN_THROUGH_ALL_CATEGORIES) return "New in";
  return CATEGORY_LABELS[category]
    ?? category.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function runThroughCaption(categoryLabel: string, prices: number[]): string {
  const lowest = Math.min(...prices.filter((price) => price > 0));
  const from = Number.isFinite(lowest) ? ` from KSh ${lowest.toLocaleString("en-KE")}` : "";
  return [
    `${prices.length} one-of-one ${categoryLabel.toLowerCase()}${from} 🔥`,
    "Only one of each. Comment the number you want, or shop through the link in my bio.",
    "#mitumba #thriftkenya #nairobifashion #kenyatiktok #secondhandfashion",
  ].join("\n");
}
