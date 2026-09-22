export const BAG_STYLES = ["CROSSBODY_BAG", "SHOULDER_BAG", "HANDBAG", "TOTE_BAG", "BACKPACK", "CLUTCH_BAG", "WAIST_BAG", "TRAVEL_BAG", "WALLET", "SCHOOL_BAGS", "OTHER"] as const;
export const BAG_STYLE_LABELS: Record<string, string> = {
  CROSSBODY_BAG: "斜挎包", SHOULDER_BAG: "单肩包", HANDBAG: "手提包", TOTE_BAG: "托特包",
  BACKPACK: "双肩包", CLUTCH_BAG: "手拿包", WAIST_BAG: "腰包", TRAVEL_BAG: "旅行包", WALLET: "钱包与卡包", SCHOOL_BAGS: "书包", OTHER: "其他"
};
export const BAG_STRAPS = ["Adjustable strap", "Fixed strap", "No shoulder strap"] as const;
export const BAG_MEASUREMENT_TYPES = ["BAG_WIDTH", "BAG_HEIGHT", "BAG_DEPTH"] as const;
export function bagDimensionsLabel(measurements: readonly { measurementType: string; finalValueCm?: unknown }[]): string {
  const labels = ["W", "H", "D"];
  return BAG_MEASUREMENT_TYPES.flatMap((type, index) => {
    const value = Number(measurements.find((item) => item.measurementType === type)?.finalValueCm);
    return Number.isFinite(value) && value > 0 ? [`${labels[index]} ${value} cm`] : [];
  }).join(" × ");
}
