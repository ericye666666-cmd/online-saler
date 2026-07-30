export const SITE_URL =
  "https://direct-loop-catalog-v0.ericye666666.chatgpt.site";

export const SHARE_CARD_VERSION = "20260718-1";

export type ProductStatus = "Available" | "Reserved" | "Sold";

export const shoeTypes = [
  "Sneakers",
  "Sports shoes",
  "High heels",
  "Leather shoes",
  "Boots",
  "Loafers",
  "Flats",
  "Sandals",
  "Slippers",
  "Kids' shoes",
  "Other",
] as const;

export type ShoeType = (typeof shoeTypes)[number];

export const bagTypes = [
  "Women's handbags",
  "Backpacks",
  "Laptop bags",
  "Tote bags",
  "Shoulder bags",
  "Crossbody bags",
  "Zipper bags",
  "Clutches",
  "Travel bags",
  "Wallets",
  "Other",
] as const;

export type BagType = (typeof bagTypes)[number];

export const textileTypes = [
  "Mattress pads",
  "Lightweight blankets",
  "Heavy blankets",
  "Bed sheets",
  "Curtains",
  "Duvets",
  "Pillowcases",
  "Towels",
  "Other",
] as const;

export type TextileType = (typeof textileTypes)[number];

export const apparelConditions = [
  "New with box",
  "New without box",
  "Like new",
  "Very good",
  "Good",
  "Fair",
] as const;

export const shoeConditionGrades = [
  "70%",
  "80%",
  "85%",
  "90%",
  "95%",
  "99%",
] as const;

export type ProductCondition =
  | (typeof apparelConditions)[number]
  | (typeof shoeConditionGrades)[number];

export type Product = {
  code: string;
  title: string;
  category: string;
  brand: string;
  shoeType?: ShoeType;
  bagType?: BagType;
  textileType?: TextileType;
  price: number;
  size: string;
  material: string;
  color: string;
  store: string;
  status: ProductStatus;
  condition: ProductCondition;
  image: string;
  ogImage: string;
  description: string;
};

export const seedProducts: Product[] = [
  {
    code: "920260718001",
    title: "Coral button-front midi dress",
    category: "Dresses",
    brand: "Unbranded",
    price: 650,
    size: "M",
    material: "Viscose blend",
    color: "Coral",
    store: "Kikuyu",
    status: "Available",
    condition: "Very good",
    image: "/products/920260718001.webp",
    ogImage: "/og/920260718001.jpg",
    description:
      "A soft coral midi dress with a flattering gathered waist and button-front finish.",
  },
  {
    code: "920260718002",
    title: "Classic blue denim jacket",
    category: "Jackets",
    brand: "Unbranded",
    price: 900,
    size: "L",
    material: "Denim",
    color: "Blue",
    store: "Kikuyu",
    status: "Available",
    condition: "Very good",
    image: "/products/920260718002.webp",
    ogImage: "/og/920260718002.jpg",
    description:
      "A timeless medium-wash denim jacket with classic chest pockets and metal buttons.",
  },
  {
    code: "920260718003",
    title: "Soft beige knit cardigan",
    category: "Knitwear",
    brand: "Unbranded",
    price: 580,
    size: "M",
    material: "Knit",
    color: "Beige",
    store: "Kikuyu",
    status: "Reserved",
    condition: "Like new",
    image: "/products/920260718003.webp",
    ogImage: "/og/920260718003.jpg",
    description:
      "An easy neutral cardigan with a soft knit texture and relaxed everyday fit.",
  },
  {
    code: "920260718004",
    title: "Emerald tie-neck blouse",
    category: "Tops",
    brand: "Unbranded",
    price: 480,
    size: "L",
    material: "Polyester",
    color: "Green",
    store: "Kinoo",
    status: "Available",
    condition: "Very good",
    image: "/products/920260718004.webp",
    ogImage: "/og/920260718004.jpg",
    description:
      "An emerald green blouse with gathered cuffs and a polished tie-neck detail.",
  },
  {
    code: "920260718005",
    title: "Structured black handbag",
    category: "Bags",
    brand: "Unbranded",
    bagType: "Women's handbags",
    price: 550,
    size: "One size",
    material: "Leather-like",
    color: "Black",
    store: "Kikuyu",
    status: "Available",
    condition: "Good",
    image: "/products/920260718005.webp",
    ogImage: "/og/920260718005.jpg",
    description:
      "A structured black handbag with top handle, shoulder strap and everyday capacity.",
  },
  {
    code: "920260718006",
    title: "White everyday sneakers",
    category: "Shoes",
    brand: "Unbranded",
    shoeType: "Sneakers",
    price: 750,
    size: "EU 39",
    material: "Faux leather",
    color: "White",
    store: "Kikuyu",
    status: "Available",
    condition: "90%",
    image: "/products/920260718006.webp",
    ogImage: "/og/920260718006.jpg",
    description:
      "Clean low-top white sneakers made for simple everyday outfits.",
  },
  {
    code: "920260718007",
    title: "Printed flowy midi skirt",
    category: "Skirts",
    brand: "Unbranded",
    price: 520,
    size: "M",
    material: "Viscose",
    color: "Black print",
    store: "Utawala",
    status: "Available",
    condition: "Very good",
    image: "/products/920260718007.webp",
    ogImage: "/og/920260718007.jpg",
    description:
      "A lightweight printed midi skirt with movement and an easy elastic waist.",
  },
  {
    code: "920260718008",
    title: "Straight-leg blue jeans",
    category: "Trousers",
    brand: "Unbranded",
    price: 680,
    size: "Waist 30",
    material: "Denim",
    color: "Blue",
    store: "Kikuyu",
    status: "Available",
    condition: "Very good",
    image: "/products/920260718008.webp",
    ogImage: "/og/920260718008.jpg",
    description:
      "Medium-wash straight-leg jeans with a clean classic silhouette.",
  },
];

export const categories = [
  "All",
  "Dresses",
  "Tops",
  "Jackets",
  "Knitwear",
  "Trousers",
  "Skirts",
  "Bags",
  "Shoes",
  "Home Textiles",
] as const;

export const conditions: ProductCondition[] = [
  ...apparelConditions,
  ...shoeConditionGrades,
];

export const featuredShoeBrands = [
  "Nike",
  "Jordan",
  "Adidas",
  "Puma",
  "New Balance",
  "Reebok",
  "Under Armour",
  "Fila",
] as const;

export const kidsShoeSizes = Array.from(
  { length: 15 },
  (_, index) => `EU ${index + 20}`,
);

export const adultShoeSizes = Array.from(
  { length: 11 },
  (_, index) => `EU ${index + 35}`,
);

export const extendedShoeSizes = [
  "EU 46",
  "EU 47",
  "EU 48",
  "EU 49",
  "EU 50",
  "EU 51+",
];

export const apparelSizes = ["All", "S", "M", "L", "One size"];

export const productStatuses: ProductStatus[] = [
  "Available",
  "Reserved",
  "Sold",
];

export function formatPrice(price: number) {
  return `KSh ${price.toLocaleString("en-KE")}`;
}

export function getProduct(code: string) {
  return seedProducts.find((product) => product.code === code);
}

export function normalizeSellerRef(value?: string | null) {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return normalized?.slice(0, 40) || undefined;
}

export function normalizeTrackingParam(value?: string | null) {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9_.:-]/g, "");
  return normalized?.slice(0, 80) || undefined;
}

export type ShareTrackingParams = {
  source?: string;
  campaign?: string;
};

function trackingQuery(sellerRef?: string, tracking?: ShareTrackingParams) {
  const normalizedRef = normalizeSellerRef(sellerRef);
  const query = new URLSearchParams();
  if (normalizedRef) query.set("ref", normalizedRef);
  const source = normalizeTrackingParam(tracking?.source);
  const campaign = normalizeTrackingParam(tracking?.campaign);
  if (source) query.set("source", source);
  if (campaign) query.set("campaign", campaign);
  query.set("card", SHARE_CARD_VERSION);
  return query;
}

export function storeUrl(sellerRef?: string, tracking?: ShareTrackingParams) {
  const query = trackingQuery(sellerRef, tracking);
  return `${SITE_URL}/?${query.toString()}`;
}

export function productUrl(code: string, sellerRef?: string, tracking?: ShareTrackingParams) {
  const query = trackingQuery(sellerRef, tracking);
  return `${SITE_URL}/p/${code}?${query.toString()}`;
}

export function whatsappShareMessage(
  product: Product,
  sellerRef?: string,
) {
  return productUrl(product.code, sellerRef, { source: "whatsapp" });
}

export function whatsappShareUrl(product: Product, sellerRef?: string) {
  return `https://wa.me/?text=${encodeURIComponent(
    whatsappShareMessage(product, sellerRef),
  )}`;
}

export function customerServiceUrl(
  product: Product,
  sellerRef: string | undefined,
  supportPhone: string,
) {
  const phone = supportPhone.replace(/\D/g, "");
  if (!phone) return null;
  const message = [
    "Hello Direct Loop, I would like to check this item:",
    `${product.title} (${product.code})`,
    ...(normalizeSellerRef(sellerRef)
      ? [`Seller reference: ${normalizeSellerRef(sellerRef)}`]
      : []),
    productUrl(product.code, sellerRef),
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
