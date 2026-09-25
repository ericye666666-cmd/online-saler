/**
 * How shoppers browse, after Vestiaire's Browse screen: Women / Men / Kids
 * first, then Bags, Clothing, Shoes, Accessories and Home inside each, then
 * a category ("Hoodies & sweatshirts", "Handbags", "Trainers").
 *
 * The operations taxonomy (category + subcategory codes) is built for intake
 * and size charts, and stays as it is. This module maps each item onto the
 * shopper's menu instead. Unisex pieces are shelved in both Women and Men;
 * home textiles, which have no audience, are too.
 */

export const departments = ["Women", "Men", "Kids"] as const;
export type Department = (typeof departments)[number];

export const groups = ["Bags", "Clothing", "Shoes", "Accessories", "Home"] as const;
export type Group = (typeof groups)[number];

const SHOE_CATEGORIES = ["Trainers", "Heels", "Flats", "Sandals & slides", "Boots", "Smart shoes", "Other shoes"];
const BAG_CATEGORIES = [
  "Handbags", "Shoulder bags", "Crossbody bags", "Tote bags", "Backpacks", "Clutch bags", "Belt bags",
  "Travel bags", "Wallets & purses", "School bags", "Other bags"
];
const ACCESSORY_CATEGORIES = ["Jewellery", "Watches", "Hats", "Scarves", "Belts", "Sunglasses", "Hair accessories", "Gloves", "Other accessories"];
const HOME_CATEGORIES = ["Bed sheets", "Blankets", "Curtains", "Other home"];

/** Each department's groups and their categories, in menu order. Only stocked ones are shown. */
export const departmentCategories: Record<Department, Record<Group, readonly string[]>> = {
  Women: {
    Bags: BAG_CATEGORIES,
    Clothing: [
      "T-shirts & vests", "Tops", "Shirts", "Hoodies & sweatshirts", "Knitwear", "Jackets", "Coats & puffers",
      "Dresses", "Skirts", "Trousers", "Jeans", "Shorts", "Jumpsuits", "Two-piece sets", "Sportswear",
      "Lingerie & shapewear", "Swimwear", "Other clothing"
    ],
    Shoes: SHOE_CATEGORIES,
    Accessories: ACCESSORY_CATEGORIES,
    Home: HOME_CATEGORIES
  },
  Men: {
    Bags: BAG_CATEGORIES,
    Clothing: [
      "T-shirts", "Polo shirts", "Shirts", "Hoodies & sweatshirts", "Knitwear", "Jackets", "Coats & puffers", "Suits",
      "Trousers", "Jeans", "Sweatpants", "Shorts", "Two-piece & tracksuits", "Swimwear", "Other clothing"
    ],
    Shoes: SHOE_CATEGORIES.filter((category) => category !== "Heels"),
    Accessories: ACCESSORY_CATEGORIES.filter((category) => category !== "Hair accessories"),
    Home: HOME_CATEGORIES
  },
  Kids: {
    Bags: BAG_CATEGORIES,
    Clothing: ["Baby", "Tops", "Hoodies & jackets", "Dresses & skirts", "Trousers & shorts", "Sets", "Pyjamas", "Other clothing"],
    Shoes: SHOE_CATEGORIES.filter((category) => category !== "Heels"),
    Accessories: ACCESSORY_CATEGORIES,
    Home: []
  }
};

export type Placement = { department: Department; group: Group; category: string };

export type CatalogDepartment = "All" | Department;

export type BrowseSelection = {
  department: CatalogDepartment;
  group?: Group | "All";
  shopCategory?: string;
  brand?: string;
};

/** The catalogue URL for a selection: `?category=<department>&group=<group>&type=<category>`. */
export function browseHref(selection: BrowseSelection, sellerRef?: string): string {
  const params = new URLSearchParams();
  if (selection.department !== "All") params.set("category", selection.department);
  if (selection.group && selection.group !== "All") params.set("group", selection.group);
  if (selection.shopCategory && selection.shopCategory !== "All") params.set("type", selection.shopCategory);
  // With nothing chosen this is the whole catalogue, not the home page.
  if (!params.size) params.set("view", "all");
  if (sellerRef) params.set("ref", sellerRef);
  return `/?${params.toString()}`;
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
  Sneakers: "Trainers", "Sports shoes": "Trainers", "High heels": "Heels", Flats: "Flats", Loafers: "Smart shoes",
  Sandals: "Sandals & slides", Slippers: "Sandals & slides", Boots: "Boots", "Leather shoes": "Smart shoes"
};

const SHOE_SUBCATEGORY_LABEL: Record<string, string> = {
  MEN_SPORT_SHOES: "Trainers", OFFICIAL_SHOES: "Smart shoes"
};

// Shoe types are often left at "Kids' shoes" or "Other"; the title usually says which.
const SHOE_BY_TITLE: Array<[RegExp, string]> = [
  [/sandal|slide|slipper|flip.?flop/i, "Sandals & slides"],
  [/boot/i, "Boots"],
  [/heel|pump|stiletto/i, "Heels"],
  [/loafer|oxford|brogue|leather shoe|formal|official|school shoe/i, "Smart shoes"],
  [/ballet|flat/i, "Flats"],
  [/sneaker|trainer|sport|running|air max|canvas/i, "Trainers"]
];

const ACCESSORY_LABEL: Record<string, string> = {
  HATS_CAPS: "Hats", SCARFS: "Scarves", BELTS: "Belts", SUNGLASSES: "Sunglasses", WATCHES: "Watches",
  JEWELLERY: "Jewellery", HAIR_ACCESSORIES: "Hair accessories", GLOVES: "Gloves"
};

const HOME_LABEL: Record<string, string> = { BEDSHEETS: "Bed sheets", LIGHT_BLANKETS: "Blankets", CURTAINS: "Curtains" };

export function classifyProduct(product: ClassifiableProduct): Placement[] {
  const category = product.category?.toUpperCase() ?? "";
  const subcategory = product.subcategory?.toUpperCase() ?? "";
  const audience = product.audience?.toUpperCase() ?? "";
  const title = product.title ?? "";
  const isShoe = product.isShoe || category === "SHOES" || category === "SHOE" || subcategory.endsWith("_SHOES");
  const kids = audience === "KIDS" || category === "KIDS" || subcategory.startsWith("KIDS_") || subcategory === "NEWBORN"
    || (isShoe && /\bkids?'?s?\b|child|toddler|baby/i.test(title));
  const shelves = (group: Group, category: string): Placement[] => audienceDepartments(kids, audience, group)
    .map((department) => ({ department, group, category: onShelf(department, group, category) }));

  if (isShoe) {
    const label = (product.shoeType ? SHOE_LABEL[product.shoeType] : undefined)
      ?? SHOE_SUBCATEGORY_LABEL[subcategory]
      ?? SHOE_BY_TITLE.find(([pattern]) => pattern.test(title))?.[1]
      ?? "Other shoes";
    return shelves("Shoes", label);
  }
  if (category === "BAG" || category === "BAGS") return shelves("Bags", BAG_LABEL[subcategory] ?? "Other bags");
  if (category === "TEXTILE" || category === "HOME_TEXTILES") return shelves("Home", HOME_LABEL[subcategory] ?? "Other home");
  if (ACCESSORY_LABEL[subcategory]) return shelves("Accessories", ACCESSORY_LABEL[subcategory]);

  const garment = garmentOf(category, subcategory, title);
  if (category === "OTHERS" && garment === "other") return shelves("Accessories", "Other accessories");
  if (kids) return [{ department: "Kids", group: "Clothing", category: KIDS_LABEL[garment] }];
  const placements: Placement[] = [];
  if (audience !== "MEN") placements.push({ department: "Women", group: "Clothing", category: WOMEN_LABEL[garment] });
  if (audience !== "WOMEN") placements.push({ department: "Men", group: "Clothing", category: MEN_LABEL[garment] });
  return placements;
}

function audienceDepartments(kids: boolean, audience: string, group: Group): Department[] {
  if (kids && group !== "Home") return ["Kids"];
  if (audience === "WOMEN") return ["Women"];
  if (audience === "MEN") return ["Men"];
  return ["Women", "Men"];
}

/** A label a department does not carry (heels on the men's shelf) falls to that group's "Other". */
function onShelf(department: Department, group: Group, category: string): string {
  const shelf = departmentCategories[department][group];
  return shelf.includes(category) ? category : shelf[shelf.length - 1] ?? category;
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

export function isGroup(value: string | null | undefined): value is Group {
  return groups.includes(value as Group);
}

export type StockedDepartment = {
  department: Department;
  total: number;
  groups: Array<{ group: Group; total: number; categories: Array<{ category: string; count: number }> }>;
};

/** Stocked groups and categories per department, in menu order, with counts. */
export function stockedMenu(placementsList: Placement[][]): StockedDepartment[] {
  return departments
    .map((department) => {
      const inDepartment = placementsList.map((placements) => placements.filter((placement) => placement.department === department));
      const stockedGroups = groups
        .map((group) => {
          const counts = new Map<string, number>();
          let total = 0;
          for (const placements of inDepartment) {
            const here = placements.filter((placement) => placement.group === group);
            if (!here.length) continue;
            total += 1;
            for (const placement of here) counts.set(placement.category, (counts.get(placement.category) ?? 0) + 1);
          }
          const categories = departmentCategories[department][group]
            .filter((category) => counts.has(category))
            .map((category) => ({ category, count: counts.get(category)! }));
          return { group, total, categories };
        })
        .filter((entry) => entry.total > 0);
      return { department, total: inDepartment.filter((placements) => placements.length > 0).length, groups: stockedGroups };
    })
    .filter((entry) => entry.total > 0);
}

/** Groups with stock across every department, for the home page tiles: Bags, Clothing, Shoes… */
export function stockedGroups(placementsList: Placement[][]): Array<{ group: Group; total: number }> {
  return groups
    .map((group) => ({ group, total: placementsList.filter((placements) => placements.some((placement) => placement.group === group)).length }))
    .filter((entry) => entry.total > 0);
}

/** Whether a piece sits on the chosen shelf; "All" at any level matches everything below it. */
export function onChosenShelf(placements: Placement[] | undefined, department = "All", group = "All", shopCategory = "All"): boolean {
  if (department === "All" && group === "All") return true;
  return (placements ?? []).some((placement) =>
    (department === "All" || placement.department === department)
      && (group === "All" || placement.group === group)
      && (shopCategory === "All" || placement.category === shopCategory));
}

/**
 * The picture row on Browse: shoppers think "tops", "trousers", "a jacket",
 * not "clothing". Clothing is split into these sections; bags, shoes,
 * accessories and home are a section each, the same as their group.
 */
export const sections = ["Tops", "Bottoms", "Jackets & coats", "Dresses & skirts", "Sets & more", "Shoes", "Bags", "Accessories", "Home"] as const;
export type Section = (typeof sections)[number];

const CLOTHING_SECTION: Record<string, Section> = {
  "T-shirts & vests": "Tops", "T-shirts": "Tops", Tops: "Tops", Shirts: "Tops", "Polo shirts": "Tops",
  "Hoodies & sweatshirts": "Tops", Knitwear: "Tops",
  Trousers: "Bottoms", Jeans: "Bottoms", Shorts: "Bottoms", Sweatpants: "Bottoms", "Trousers & shorts": "Bottoms",
  Jackets: "Jackets & coats", "Coats & puffers": "Jackets & coats", Suits: "Jackets & coats", "Hoodies & jackets": "Jackets & coats",
  Dresses: "Dresses & skirts", Skirts: "Dresses & skirts", Jumpsuits: "Dresses & skirts", "Dresses & skirts": "Dresses & skirts"
};

export function sectionOf(group: Group, category: string): Section {
  if (group !== "Clothing") return group;
  return CLOTHING_SECTION[category] ?? "Sets & more";
}

export function isSection(value: string | null | undefined): value is Section {
  return sections.includes(value as Section);
}

export type BrowseSection = {
  section: Section;
  total: number;
  /** The whole group when the section is one (Bags, Shoes…), so it can offer "All bags". */
  group?: Group;
  categories: Array<{ group: Group; category: string; count: number; image?: string }>;
};

type BrowsableProduct = { code: string; image?: string | null; placements?: Placement[] };

/**
 * A department's stocked sections, in menu order, each with its categories
 * and a cover photo per category. Covers are picked in list order (newest
 * first) and a piece covers at most one tile, so the grid does not repeat itself.
 */
export function browseSections(products: BrowsableProduct[], department: Department): BrowseSection[] {
  const covers = new Set<string>();
  const byKey = new Map<string, { count: number; image?: string }>();
  for (const product of products) {
    for (const placement of product.placements ?? []) {
      if (placement.department !== department) continue;
      const key = `${placement.group}\u0000${placement.category}`;
      const entry = byKey.get(key) ?? { count: 0 };
      entry.count += 1;
      if (!entry.image && product.image && !covers.has(product.code)) {
        entry.image = product.image;
        covers.add(product.code);
      }
      byKey.set(key, entry);
    }
  }
  // A second pass lets a category whose only pieces already cover another tile still show a photo.
  for (const product of products) {
    for (const placement of product.placements ?? []) {
      if (placement.department !== department || !product.image) continue;
      const entry = byKey.get(`${placement.group}\u0000${placement.category}`);
      if (entry && !entry.image) entry.image = product.image;
    }
  }

  return sections
    .map((section): BrowseSection => {
      const categories = groups.flatMap((group) => departmentCategories[department][group]
        .filter((category) => sectionOf(group, category) === section)
        .flatMap((category) => {
          const entry = byKey.get(`${group}\u0000${category}`);
          return entry ? [{ group, category, count: entry.count, ...(entry.image ? { image: entry.image } : {}) }] : [];
        }));
      return {
        section,
        total: categories.reduce((sum, entry) => sum + entry.count, 0),
        ...(isGroup(section) ? { group: section } : {}),
        categories
      };
    })
    .filter((entry) => entry.total > 0);
}
