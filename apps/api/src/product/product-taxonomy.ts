import { prisma } from "@online-saler/database";
import {
  AI_COLORS,
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_SUBCATEGORIES_BY_CATEGORY
} from "@online-saler/shared-types";

export const PRODUCT_TAXONOMY_SETTING_KEY = "PRODUCT_TAXONOMY_V1";
export const PRODUCT_TAXONOMY_GROUPS = ["CATEGORY", "SUBCATEGORY", "COLOR", "SIZE", "CONDITION", "DEFECT"] as const;
export type ProductTaxonomyGroup = (typeof PRODUCT_TAXONOMY_GROUPS)[number];
export type ProductTaxonomyOption = {
  code: string;
  displayName: string;
  parentCode?: string | null;
  sortOrder: number;
  active: boolean;
};
export type ProductTaxonomyDocument = {
  version: 1;
  groups: Record<ProductTaxonomyGroup, ProductTaxonomyOption[]>;
};

export async function loadProductTaxonomy(): Promise<ProductTaxonomyDocument> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: PRODUCT_TAXONOMY_SETTING_KEY } });
  return normalizeDocument(setting?.valueJson);
}

export function activeTaxonomyCodes(document: ProductTaxonomyDocument, group: ProductTaxonomyGroup): string[] {
  return document.groups[group].filter((option) => option.active).sort(sortOptions).map((option) => option.code);
}

export function defaultProductTaxonomy(): ProductTaxonomyDocument {
  const categories = PRODUCT_CATEGORY_OPTIONS.map((code, index) => option(code, index));
  const subcategories = Object.entries(PRODUCT_SUBCATEGORIES_BY_CATEGORY).flatMap(([parentCode, values]) =>
    values.filter((code, index, array) => array.indexOf(code) === index).map((code) => ({ code, parentCode }))
  );
  const uniqueSubcategories = [...new Map(subcategories.map((entry) => [entry.code, entry])).values()]
    .map((entry, index) => option(entry.code, index, entry.code === "OTHER" ? null : entry.parentCode));
  return {
    version: 1,
    groups: {
      CATEGORY: categories,
      SUBCATEGORY: uniqueSubcategories,
      COLOR: AI_COLORS.map((code, index) => option(code, index)),
      SIZE: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"].map((code, index) => option(code, index)),
      CONDITION: ["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR"].map((code, index) => option(code, index)),
      DEFECT: ["STAIN", "HOLE", "TEAR", "FADING", "PILLING", "MISSING_BUTTON", "BROKEN_ZIP", "LOOSE_STITCHING", "OTHER"].map((code, index) => option(code, index))
    }
  };
}

export function normalizeDocument(value: unknown): ProductTaxonomyDocument {
  const fallback = defaultProductTaxonomy();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const groups = (value as { groups?: unknown }).groups;
  if (!groups || typeof groups !== "object" || Array.isArray(groups)) return fallback;
  const result = defaultProductTaxonomy();
  for (const group of PRODUCT_TAXONOMY_GROUPS) {
    const raw = (groups as Record<string, unknown>)[group];
    if (!Array.isArray(raw)) continue;
    const normalized = raw.map(normalizeOption).filter((entry): entry is ProductTaxonomyOption => Boolean(entry));
    if (normalized.length) result.groups[group] = normalized.sort(sortOptions);
  }
  return result;
}

export function normalizeTaxonomyCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeOption(value: unknown): ProductTaxonomyOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const code = normalizeTaxonomyCode(String(record.code ?? ""));
  const displayName = String(record.displayName ?? "").trim();
  if (!code || !displayName) return null;
  const sortOrder = Number(record.sortOrder);
  return {
    code,
    displayName,
    parentCode: record.parentCode ? normalizeTaxonomyCode(String(record.parentCode)) : null,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    active: record.active !== false
  };
}

function option(code: string, sortOrder: number, parentCode?: string | null): ProductTaxonomyOption {
  return { code, displayName: TAXONOMY_LABELS[code] ?? code.replaceAll("_", " "), parentCode: parentCode ?? null, sortOrder, active: true };
}

function sortOptions(left: ProductTaxonomyOption, right: ProductTaxonomyOption) {
  return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code);
}

const TAXONOMY_LABELS: Record<string, string> = {
  KIDS: "童装", PANTS: "长裤", JACKETS: "外套", DRESSES: "连衣裙与半身裙", LADY_TOPS: "女士上衣", SHIRTS: "衬衫", TSHIRTS: "T恤", SHORT: "短裤", TWO_PIECE: "两件套", SHOES: "鞋", BAG: "包", OTHERS: "其他配饰", TEXTILE: "家纺", OTHER: "其他",
  KIDS_DRESS: "童装裙", KIDS_JACKET_TOP: "童装外套与上衣", KIDS_PANTS: "童装裤", NEWBORN: "新生儿服装", MEN_JEANS: "男士牛仔裤", LADIES_PANTS_MIX: "女士裤", SWEAT_PANTS: "运动裤", CARGO_PANTS: "工装裤", OFFICIAL_PANTS: "正装裤", MEN_JACKETS: "男士外套", THICK_VEST: "厚马甲", LADIES_JACKETS: "女士外套", UNISEX_JACKETS: "中性外套", HOODIES: "连帽卫衣", SWEATSHIRTS: "卫衣", DENIM_JACKETS: "牛仔外套", LONG_DRESSES: "长裙", SHORT_DRESSES_SKIRTS: "短裙与半身裙", OFFICIAL_TOPS: "正装上衣", FANCY_TOPS: "时尚上衣", SHORT_SHIRTS: "短袖衬衫", LONG_SHIRTS: "长袖衬衫", TSHIRT: "T恤", SHORT_PANTS: "短裤", LONG_TWO_PIECE: "长款两件套", SHORT_TWO_PIECE: "短款两件套", MEN_SPORT_SHOES: "男士运动鞋", MEN_SHOES: "男鞋", LADIES_SHOES: "女鞋", KIDS_SHOES: "童鞋", OFFICIAL_SHOES: "正装鞋", LADIES_BAGS: "女包", SCHOOL_BAGS: "书包", PACKAGE_BAGS: "包装袋", HATS_CAPS: "帽子", SCARFS: "围巾", BODY_SHAPERS: "塑身衣", INNER_WARES: "内衣", BEDSHEETS: "床单", LIGHT_BLANKETS: "薄毯",
  BLACK: "黑色", WHITE: "白色", OFF_WHITE: "米白", GREY: "灰色", BROWN: "棕色", BEIGE: "米色", CREAM: "奶油色", TAN: "棕褐色", KHAKI: "卡其色", RED: "红色", MAROON: "栗色", BURGUNDY: "酒红", ORANGE: "橙色", CORAL: "珊瑚色", PEACH: "桃色", YELLOW: "黄色", MUSTARD: "芥末黄", GREEN: "绿色", LIGHT_GREEN: "浅绿", DARK_GREEN: "深绿", OLIVE: "橄榄绿", BLUE: "蓝色", LIGHT_BLUE: "浅蓝", DARK_BLUE: "深蓝", NAVY: "藏青", DENIM: "牛仔蓝", TEAL: "蓝绿色", TURQUOISE: "青绿色", PURPLE: "紫色", LILAC: "丁香紫", PINK: "粉色", GOLD: "金色", SILVER: "银色", MULTICOLOR: "多色",
  LIKE_NEW: "近全新", EXCELLENT: "成色优秀", GOOD: "成色良好", FAIR: "有明显使用痕迹", STAIN: "污渍", HOLE: "破洞", TEAR: "撕裂", FADING: "褪色", PILLING: "起球", MISSING_BUTTON: "缺纽扣", BROKEN_ZIP: "拉链损坏", LOOSE_STITCHING: "开线"
};
