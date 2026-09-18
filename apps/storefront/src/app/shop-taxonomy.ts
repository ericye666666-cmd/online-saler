/**
 * How shoppers browse: department first (Women, Men, Kids, Bags, Shoes,
 * Accessories, Home), then a category inside it — the shape of Vestiaire's
 * web catalogue, cut to what a second-hand shop in Kenya actually stocks.
 *
 * The operations taxonomy (category + subcategory codes) is built for intake
 * and size charts, and stays as it is. This module maps each item onto the
 * shopper's menu instead. Unisex clothing is placed in both Women and Men.
 */

export const departments = ["Women", "Men", "Kids", "Bags", "Shoes", "Accessories", "Home"] as const;
export type Department = (typeof departments)[number];

/** Each department's categories, in menu order. Only stocked ones are shown. */
export const departmentCategories: Record<Department, readonly string[]> = {
  Women: [
    "T-shirts & vests", "Tops", "Shirts", "Hoodies & sweatshirts", "Knitwear", "Jackets", "Coats & puffers",
    "Dresses", "Skirts", "Trousers", "Jeans", "Shorts", "Jumpsuits", "Two-piece sets", "Sportswear",
    "Lingerie & shapewear", "Swimwear", "Other clothing"
  ],
  Men: [
    "T-shirts", "Polo shirts", "Shirts", "Hoodies & sweatshirts", "Knitwear", "Jackets", "Coats & puffers", "Suits",
    "Trousers", "Jeans", "Sweatpants", "Shorts", "Two-piece & tracksuits", "Swimwear", "Other clothing"
  ],
  Kids: ["Baby", "Tops", "Hoodies & jackets", "Dresses & skirts", "Trousers & shorts", "Sets", "Pyjamas", "Other clothing"],
  Bags: [
    "Handbags", "Shoulder bags", "Crossbody bags", "Tote bags", "Backpacks", "Clutch bags", "Belt bags",
    "Travel bags", "Wallets & purses", "School bags", "Other bags"
  ],
  Shoes: ["Trainers", "Heels", "Flats", "Sandals & slides", "Boots", "Smart shoes", "Kids' shoes", "Other shoes"],
  Accessories: ["Hats", "Scarves", "Belts", "Sunglasses", "Watches", "Jewellery", "Hair accessories", "Gloves", "Other accessories"],
  Home: ["Bed sheets", "Blankets", "Curtains", "Other home"]
};

export type Placement = { department: Department; category: string };

export type CatalogDepartment = "All" | Department;

export type BrowseSelection = {
  department: CatalogDepartment;
  shopCategory?: string;
  brand?: string;
};

/** The catalogue URL for a selection: `?category=<department>&type=<category>`. */
export function browseHref(selection: BrowseSelection, sellerRef?: string): string {
  const params = new URLSearchParams();
  if (selection.department !== "All") params.set("category", selection.department);
  if (selection.shopCategory && selection.shopCategory !== "All") params.set("type", selection.shopCategory);
  if (sellerRef) params.set("ref", sellerRef);
  return `/${params.size ? `?${params.toString()}` : ""}`;
}

export type ClassifiableProduct = {
  category?: string | null;
  subcategory?: string | null;
  audience?: string | null;
  shoeType?: string | null;
  title?: string | null;
  isShoe?: boolean;
};

// A garment's kind, independent of who it is for.
type Garment =
  | "tshirt" | "tank" | "top" | "shirt" | "polo" | "hoodie" | "knit" | "jacket" | "coat" | "suit"
  | "dress" | "skirt" | "trousers" | "jeans" | "sweatpants" | "shorts" | "jumpsuit" | "set" | "tracksuit"
  | "lingerie" | "swimwear" | "pyjamas" | "baby" | "other";

const GARMENT_BY_SUBCATEGORY: Record<string, Garment> = {
  TSHIRT: "tshirt", BASIC_TSHIRT: "tshirt", GRAPHIC_TSHIRT: "tshirt", TANK_TOPS: "tank",
  FANCY_TOPS: "top", CROP_TOPS: "top", OFFICIAL_TOPS: "top", KIDS_TOPS: "top",
  SHORT_SHIRTS: "shirt", LONG_SHIRTS: "shirt", BLOUSES: "shirt", POLO_SHIRTS: "polo",
  HOODIES: "hoodie", SWEATSHIRTS: "hoodie", KIDS_HOODIES: "hoodie",
  SWEATERS: "knit", CARDIGANS: "knit", KNITWEAR: "knit",
  MEN_JACKETS: "jacket", LADIES_JACKETS: "jacket", UNISEX_JACKETS: "jacket", THICK_VEST: "jacket", DENIM_JACKETS: "jacket",
  BLAZERS: "jacket", WINDBREAKERS: "jacket", RAIN_JACKETS: "jacket", KIDS_JACKET_TOP: "jacket",
  PUFFER_JACKETS: "coat", COATS: "coat", SUITS: "suit",
  LONG_DRESSES: "dress", MIDI_DRESSES: "dress", MINI_DRESSES: "dress", SHORT_DRESSES_SKIRTS: "dress", KIDS_DRESS: "dress",
  MAXI_SKIRTS: "skirt", MIDI_SKIRTS: "skirt", MINI_SKIRTS: "skirt", KIDS_SKIRTS: "skirt", JUMPSUITS: "jumpsuit",
  MEN_JEANS: "jeans", WOMEN_JEANS: "jeans", SWEAT_PANTS: "sweatpants",
  LADIES_PANTS_MIX: "trousers", CARGO_PANTS: "trousers", OFFICIAL_PANTS: "trousers", LEGGINGS: "trousers",
  WIDE_LEG_PANTS: "trousers", KIDS_PANTS: "trousers",
  SHORT_PANTS: "shorts", DENIM_SHORTS: "shorts", CARGO_SHORTS: "shorts", SPORTS_SHORTS: "shorts", KIDS_SHORTS: "shorts",
  LONG_TWO_PIECE: "set", SHORT_TWO_PIECE: "set", KIDS_SETS: "set", TRACKSUITS: "tracksuit",
  BODY_SHAPERS: "lingerie", INNER_WARES: "lingerie", SWIMWEAR: "swimwear", KIDS_PYJAMAS: "pyjamas", NEWBORN: "baby"
};

const GARMENT_BY_CATEGORY: Record<string, Garment> = {
  TSHIRTS: "tshirt", SHIRTS: "shirt", LADY_TOPS: "top", JACKETS: "jacket", PANTS: "trousers",
  SHORT: "shorts", DRESSES: "dress", TWO_PIECE: "set",
  // Codes from before the current taxonomy, still on some older items.
  TOP: "top", BLOUSES: "shirt", JACKET: "jacket", KNITWEAR: "knit", TROUSER: "trousers", TROUSERS: "trousers",
  DRESS: "dress", SKIRT: "skirt"
};

// Titles rescue items filed under OTHER, or under a category that does not
// fit them (a blazer under women's tops, hoodies under accessories).
const GARMENT_BY_TITLE: Array<[RegExp, Garment]> = [
  [/hoodie|hooded|sweatshirt|crew\s*neck\s*sweat/i, "hoodie"],
  [/blazer|jacket|bomber|windbreaker|gilet/i, "jacket"],
  [/coat|puffer|parka/i, "coat"],
  [/polo/i, "polo"],
  [/t-?shirt|\btee\b/i, "tshirt"],
  [/sweater|jumper|cardigan|knit/i, "knit"],
  [/jeans?\b|denim trousers/i, "jeans"],
  [/jumpsuit|playsuit|romper/i, "jumpsuit"],
  [/dress/i, "dress"],
  [/skirt/i, "skirt"],
  [/shorts/i, "shorts"],
  [/trousers|pants|chinos|leggings/i, "trousers"],
  [/shirt|blouse/i, "shirt"],
  [/\btop\b|camisole|vest/i, "top"]
];

const WOMEN_LABEL: Record<Garment, string> = {
  tshirt: "T-shirts & vests", tank: "T-shirts & vests", top: "Tops", shirt: "Shirts", polo: "Shirts",
  hoodie: "Hoodies & sweatshirts", knit: "Knitwear", jacket: "Jackets", coat: "Coats & puffers", suit: "Jackets",
  dress: "Dresses", skirt: "Skirts", trousers: "Trousers", jeans: "Jeans", sweatpants: "Sportswear", shorts: "Shorts",
  jumpsuit: "Jumpsuits", set: "Two-piece sets", tracksuit: "Sportswear", lingerie: "Lingerie & shapewear",
  swimwear: "Swimwear", pyjamas: "Other clothing", baby: "Other clothing", other: "Other clothing"
};

const MEN_LABEL: Record<Garment, string> = {
  tshirt: "T-shirts", tank: "T-shirts", top: "T-shirts", shirt: "Shirts", polo: "Polo shirts",
  hoodie: "Hoodies & sweatshirts", knit: "Knitwear", jacket: "Jackets", coat: "Coats & puffers", suit: "Suits",
  dress: "Other clothing", skirt: "Other clothing", trousers: "Trousers", jeans: "Jeans", sweatpants: "Sweatpants",
  shorts: "Shorts", jumpsuit: "Other clothing", set: "Two-piece & tracksuits", tracksuit: "Two-piece & tracksuits",
  lingerie: "Other clothing", swimwear: "Swimwear", pyjamas: "Other clothing", baby: "Other clothing", other: "Other clothing"
};

const KIDS_LABEL: Record<Garment, string> = {
  tshirt: "Tops", tank: "Tops", top: "Tops", shirt: "Tops", polo: "Tops",
  hoodie: "Hoodies & jackets", knit: "Hoodies & jackets", jacket: "Hoodies & jackets", coat: "Hoodies & jackets", suit: "Sets",
  dress: "Dresses & skirts", skirt: "Dresses & skirts", trousers: "Trousers & shorts", jeans: "Trousers & shorts",
  sweatpants: "Trousers & shorts", shorts: "Trousers & shorts", jumpsuit: "Sets", set: "Sets", tracksuit: "Sets",
  lingerie: "Other clothing", swimwear: "Other clothing", pyjamas: "Pyjamas", baby: "Baby", other: "Other clothing"
};

const BAG_LABEL: Record<string, string> = {
  HANDBAG: "Handbags", LADIES_BAGS: "Handbags", SHOULDER_BAG: "Shoulder bags", CROSSBODY_BAG: "Crossbody bags",
  TOTE_BAG: "Tote bags", BACKPACK: "Backpacks", CLUTCH_BAG: "Clutch bags", WAIST_BAG: "Belt bags",
  TRAVEL_BAG: "Travel bags", WALLET: "Wallets & purses", SCHOOL_BAGS: "School bags"
};

const SHOE_LABEL: Record<string, string> = {
  Sneakers: "Trainers", "Sports shoes": "Trainers", "High heels": "Heels", Flats: "Flats", Loafers: "Flats",
  Sandals: "Sandals & slides", Slippers: "Sandals & slides", Boots: "Boots", "Leather shoes": "Smart shoes",
  "Kids' shoes": "Kids' shoes"
};

const SHOE_SUBCATEGORY_LABEL: Record<string, string> = {
  MEN_SPORT_SHOES: "Trainers", OFFICIAL_SHOES: "Smart shoes", MEN_SHOES: "Smart shoes", KIDS_SHOES: "Kids' shoes"
};

const ACCESSORY_LABEL: Record<string, string> = {
  HATS_CAPS: "Hats", SCARFS: "Scarves", BELTS: "Belts", SUNGLASSES: "Sunglasses", WATCHES: "Watches",
  JEWELLERY: "Jewellery", HAIR_ACCESSORIES: "Hair accessories", GLOVES: "Gloves"
};

const HOME_LABEL: Record<string, string> = { BEDSHEETS: "Bed sheets", LIGHT_BLANKETS: "Blankets", CURTAINS: "Curtains" };

export function classifyProduct(product: ClassifiableProduct): Placement[] {
  const category = product.category?.toUpperCase() ?? "";
  const subcategory = product.subcategory?.toUpperCase() ?? "";
  const audience = product.audience?.toUpperCase() ?? "";

  if (product.isShoe || category === "SHOES" || category === "SHOE") {
    const label = (audience === "KIDS" ? "Kids' shoes" : null)
      ?? (product.shoeType ? SHOE_LABEL[product.shoeType] : undefined)
      ?? SHOE_SUBCATEGORY_LABEL[subcategory]
      ?? "Other shoes";
    return [{ department: "Shoes", category: label }];
  }
  if (category === "BAG" || category === "BAGS") {
    return [{ department: "Bags", category: BAG_LABEL[subcategory] ?? (subcategory === "SCHOOL_BAGS" ? "School bags" : "Other bags") }];
  }
  if (category === "TEXTILE" || category === "HOME_TEXTILES") {
    return [{ department: "Home", category: HOME_LABEL[subcategory] ?? "Other home" }];
  }
  if (ACCESSORY_LABEL[subcategory]) {
    return [{ department: "Accessories", category: ACCESSORY_LABEL[subcategory] }];
  }

  const garment = garmentOf(category, subcategory, product.title ?? "");
  if (category === "OTHERS" && garment === "other") {
    return [{ department: "Accessories", category: "Other accessories" }];
  }
  if (audience === "KIDS" || category === "KIDS") {
    return [{ department: "Kids", category: KIDS_LABEL[garment] }];
  }
  const placements: Placement[] = [];
  if (audience !== "MEN") placements.push({ department: "Women", category: WOMEN_LABEL[garment] });
  if (audience !== "WOMEN") placements.push({ department: "Men", category: MEN_LABEL[garment] });
  return placements;
}

function garmentOf(category: string, subcategory: string, title: string): Garment {
  const bySubcategory = GARMENT_BY_SUBCATEGORY[subcategory];
  if (bySubcategory) return bySubcategory;
  const byTitle = GARMENT_BY_TITLE.find(([pattern]) => pattern.test(title))?.[1];
  return byTitle ?? GARMENT_BY_CATEGORY[category] ?? "other";
}

export function isDepartment(value: string | null | undefined): value is Department {
  return departments.includes(value as Department);
}

/** Stocked categories per department, in menu order, with counts. */
export function stockedMenu(placementsList: Placement[][]): Array<{ department: Department; total: number; categories: Array<{ category: string; count: number }> }> {
  return departments
    .map((department) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (const placements of placementsList) {
        const here = placements.filter((placement) => placement.department === department);
        if (!here.length) continue;
        total += 1;
        for (const placement of here) counts.set(placement.category, (counts.get(placement.category) ?? 0) + 1);
      }
      const categories = departmentCategories[department]
        .filter((category) => counts.has(category))
        .map((category) => ({ category, count: counts.get(category)! }));
      return { department, total, categories };
    })
    .filter((entry) => entry.total > 0);
}
