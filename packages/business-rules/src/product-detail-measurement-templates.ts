export const PRODUCT_DETAIL_MEASUREMENT_TEMPLATE_VERSION = "measurement-guides-v2.0.0";

export type ProductDetailMeasurementTemplateCode =
  | "T_SHIRT"
  | "SHIRT"
  | "BLOUSE"
  | "HOODIE"
  | "SWEATER"
  | "OUTERWEAR"
  | "DRESS"
  | "DRESS_SLEEVELESS"
  | "DRESS_SLEEVED"
  | "PANTS"
  | "SHORTS"
  | "SKIRT"
  | "KIDS_TOP"
  | "TWO_PIECE_SET"
  | "GENERIC_TOP"
  | "GENERIC_BOTTOM"
  | "GENERIC_GARMENT";

export type ProductDetailMeasurementField = {
  key: string;
  label: string;
  sourceKeys: readonly string[];
  required: boolean;
};

export type ProductDetailMeasurementTemplate = {
  code: ProductDetailMeasurementTemplateCode;
  name: string;
  garmentType: string;
  version: string;
  measurementFields: readonly ProductDetailMeasurementField[];
  svgSource: string;
  measurementGuides: Readonly<Record<string, ProductDetailMeasurementGuide>>;
};

export type ProductDetailMeasurementGuide = {
  path: string;
  markerX: number;
  markerY: number;
};

export type ResolvedProductDetailMeasurement = ProductDetailMeasurementField & {
  sourceKey: string;
  valueCm: number;
};

const field = (
  key: string,
  label: string,
  sourceKeys: readonly string[],
  required = true
): ProductDetailMeasurementField => ({ key, label, sourceKeys, required });

const shoulderWidth = field("shoulderWidth", "Shoulder width", ["SHOULDER_WIDTH"]);
const chestWidth = field("chestWidth", "Chest width", ["CHEST_WIDTH"]);
const bustWidth = field("bustWidth", "Bust width", ["BUST_WIDTH", "CHEST_WIDTH"]);
const sleeveLength = field("sleeveLength", "Sleeve length", ["SLEEVE_LENGTH"]);
const optionalSleeveLength = field("sleeveLength", "Sleeve length", ["SLEEVE_LENGTH"], false);
const garmentLength = field("garmentLength", "Garment length", ["GARMENT_LENGTH", "LENGTH"]);
const hemWidth = field("hemWidth", "Hem width", ["HEM_WIDTH"], false);
const waistWidth = field("waistWidth", "Waist width", ["WAIST_WIDTH", "WAIST"]);
const hipWidth = field("hipWidth", "Hip width", ["HIP_WIDTH", "HIP"]);
const thighWidth = field("thighWidth", "Thigh width", ["THIGH_WIDTH"]);
const inseam = field("inseam", "Inseam", ["INSEAM"]);
const optionalInseam = field("inseam", "Inseam", ["INSEAM"], false);
const outseam = field("outseam", "Outseam", ["OUTSEAM"]);
const legOpening = field("legOpening", "Leg opening", ["LEG_OPENING"]);
const rise = field("rise", "Rise", ["RISE"], false);

const topFields = [shoulderWidth, chestWidth, sleeveLength, garmentLength] as const;
const dressFields = [shoulderWidth, bustWidth, waistWidth, hipWidth, garmentLength, optionalSleeveLength] as const;
const pantsFields = [waistWidth, hipWidth, thighWidth, inseam, outseam, legOpening, rise] as const;
const shortsFields = [waistWidth, hipWidth, thighWidth, field("rise", "Rise", ["RISE"]), inseam, legOpening] as const;
const skirtFields = [waistWidth, hipWidth, garmentLength, hemWidth] as const;
const twoPieceFields = [
  field("topShoulderWidth", "Top shoulder width", ["TOP_SHOULDER_WIDTH", "SHOULDER_WIDTH"]),
  field("topChestWidth", "Top chest width", ["TOP_CHEST_WIDTH", "CHEST_WIDTH"]),
  field("topGarmentLength", "Top garment length", ["TOP_GARMENT_LENGTH", "TOP_LENGTH", "LENGTH"]),
  field("topSleeveLength", "Top sleeve length", ["TOP_SLEEVE_LENGTH", "SLEEVE_LENGTH"], false),
  field("bottomWaistWidth", "Bottom waist width", ["BOTTOM_WAIST_WIDTH", "WAIST_WIDTH", "WAIST"]),
  field("bottomHipWidth", "Bottom hip width", ["BOTTOM_HIP_WIDTH", "HIP_WIDTH", "HIP"]),
  field("bottomGarmentLength", "Bottom garment length", ["BOTTOM_GARMENT_LENGTH", "BOTTOM_LENGTH", "OUTSEAM"]),
  field("bottomInseam", "Bottom inseam", ["BOTTOM_INSEAM", "INSEAM"], false)
] as const;

const TOP_OUTLINE = `<path d="M135 78 210 40h100l75 38 110 92-72 88-58-48v395H155V210l-58 48-72-88z"/><path d="M210 42q50 55 100 0" class="detail"/>`;
const T_SHIRT_OUTLINE = `<path d="M145 82 210 42h100l65 40 105 88-72 86-58-48v397H170V208l-58 48-72-86z"/><path d="M215 44q45 48 90 0" class="detail"/>`;
const SHIRT_OUTLINE = `<path d="M132 82 205 40h110l73 42 105 90-74 88-57-48v393H158V212l-57 48-74-88z"/><path d="m205 42 55 68 55-68M260 110v495" class="detail"/><circle cx="260" cy="210" r="5"/><circle cx="260" cy="285" r="5"/><circle cx="260" cy="360" r="5"/>`;
const BLOUSE_OUTLINE = `<path d="M136 82 210 42h100l74 40 100 90-70 84-62-48 36 397H132l36-397-62 48-70-84z"/><path d="M214 44q46 92 92 0" class="detail"/>`;
const HOODIE_OUTLINE = `<path d="M132 100 205 62h110l73 38 105 82-72 86-55-42v379H154V226l-55 42-72-86z"/><path d="M194 72Q260-55 326 72q-22 80-66 94-44-14-66-94M235 145v92m50-92v92M184 458q76-48 152 0v96H184z" class="detail"/>`;
const SWEATER_OUTLINE = `<path d="M135 80 210 42h100l75 38 110 92-72 88-58-48v393H155V212l-58 48-72-88z"/><path d="M210 43q50 55 100 0M155 555h210M75 240l52 42m318-42-52 42" class="detail"/>`;
const OUTERWEAR_OUTLINE = `<path d="M128 80 205 38h110l77 42 108 92-75 90-57-48v391H152V214l-57 48-75-90z"/><path d="m205 40 55 105 55-105M260 145v460M175 330h58v95h-58m170-95h-58v95h58" class="detail"/>`;
const DRESS_OUTLINE = `<path d="M145 62 215 30h90l70 32 92 82-65 84-57-45-18 155 112 267H81l112-267-18-155-57 45-65-84z"/><path d="M215 32q45 52 90 0M179 270h162M161 350h198" class="detail"/>`;
const DRESS_SLEEVELESS_OUTLINE = `<path d="M205 95 225 30h23l12 35 12-35h23l20 65 12 243 112 267H81l112-267z"/><path d="M225 30 260 65 295 30M192 270h136M164 350h192" class="detail"/>`;
const DRESS_SLEEVED_OUTLINE = `<path d="M145 62 215 30h90l70 32 92 82-65 84-57-45-18 155 112 267H81l112-267-18-155-57 45-65-84z"/><path d="M215 32q45 52 90 0M179 270h162M161 350h198" class="detail"/>`;
const PANTS_OUTLINE = `<path d="M105 40h310l-25 565H275L250 285l-25 320H110z"/><path d="M105 86h310M122 205h276M250 86v199" class="detail"/>`;
const SHORTS_OUTLINE = `<path d="M105 55h310l-18 355H285l-35-170-35 170H103z"/><path d="M105 100h310M117 205h286M250 100v140" class="detail"/>`;
const SKIRT_OUTLINE = `<path d="M145 48h210l75 557H70z"/><path d="M145 95h210M118 250h264" class="detail"/>`;
const KIDS_TOP_OUTLINE = `<path d="M155 112 215 72h90l60 40 90 75-60 75-50-38v335H175V224l-50 38-60-75z"/><path d="M217 74q43 44 86 0" class="detail"/>`;
const TWO_PIECE_OUTLINE = `<g transform="translate(-8 20) scale(.72)">${T_SHIRT_OUTLINE}</g><g transform="translate(255 150) scale(.58)">${PANTS_OUTLINE}</g>`;
const GENERIC_GARMENT_OUTLINE = `<path d="M180 58h160l70 90-46 100v357H156V248l-46-100z"/><path d="M180 60q80 70 160 0" class="detail"/>`;

const template = (
  code: ProductDetailMeasurementTemplateCode,
  name: string,
  garmentType: string,
  measurementFields: readonly ProductDetailMeasurementField[],
  svgSource: string,
  measurementGuides: Readonly<Record<string, ProductDetailMeasurementGuide>> = {}
): ProductDetailMeasurementTemplate => ({
  code,
  name,
  garmentType,
  version: PRODUCT_DETAIL_MEASUREMENT_TEMPLATE_VERSION,
  measurementFields,
  svgSource,
  measurementGuides
});

const TOP_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  shoulderWidth: { path: "M205 40H315", markerX: 260, markerY: 18 },
  chestWidth: { path: "M155 238H365", markerX: 388, markerY: 238 },
  bustWidth: { path: "M155 238H365", markerX: 388, markerY: 238 },
  sleeveLength: { path: "M365 82 462 170", markerX: 478, markerY: 176 },
  garmentLength: { path: "M118 42V605", markerX: 92, markerY: 325 },
  hemWidth: { path: "M155 575H365", markerX: 388, markerY: 575 }
};

const DRESS_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  shoulderWidth: { path: "M215 30H305", markerX: 260, markerY: 12 },
  bustWidth: { path: "M175 220H345", markerX: 368, markerY: 220 },
  waistWidth: { path: "M179 270H341", markerX: 364, markerY: 270 },
  hipWidth: { path: "M161 350H359", markerX: 382, markerY: 350 },
  garmentLength: { path: "M52 30V605", markerX: 28, markerY: 320 },
  sleeveLength: { path: "M375 62 467 144", markerX: 482, markerY: 150 }
};

const PANTS_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  waistWidth: { path: "M105 40H415", markerX: 260, markerY: 18 },
  hipWidth: { path: "M120 205H400", markerX: 423, markerY: 205 },
  thighWidth: { path: "M118 300H232", markerX: 175, markerY: 278 },
  inseam: { path: "M250 285V605", markerX: 272, markerY: 450 },
  outseam: { path: "M82 40V605", markerX: 58, markerY: 325 },
  legOpening: { path: "M110 580H225", markerX: 168, markerY: 558 },
  rise: { path: "M250 86V285", markerX: 272, markerY: 185 }
};

const SKIRT_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  waistWidth: { path: "M145 48H355", markerX: 250, markerY: 25 },
  hipWidth: { path: "M118 250H382", markerX: 405, markerY: 250 },
  garmentLength: { path: "M45 48V605", markerX: 22, markerY: 325 },
  hemWidth: { path: "M70 580H430", markerX: 250, markerY: 558 }
};

export const PRODUCT_DETAIL_MEASUREMENT_TEMPLATES: Readonly<Record<ProductDetailMeasurementTemplateCode, ProductDetailMeasurementTemplate>> = {
  T_SHIRT: template("T_SHIRT", "T-shirt", "TOP", topFields, T_SHIRT_OUTLINE, TOP_GUIDES),
  SHIRT: template("SHIRT", "Shirt", "TOP", [...topFields, hemWidth], SHIRT_OUTLINE, TOP_GUIDES),
  BLOUSE: template("BLOUSE", "Blouse", "TOP", [shoulderWidth, bustWidth, sleeveLength, garmentLength, hemWidth], BLOUSE_OUTLINE, TOP_GUIDES),
  HOODIE: template("HOODIE", "Hoodie", "TOP", topFields, HOODIE_OUTLINE, TOP_GUIDES),
  SWEATER: template("SWEATER", "Sweater", "TOP", topFields, SWEATER_OUTLINE, TOP_GUIDES),
  OUTERWEAR: template("OUTERWEAR", "Outerwear", "TOP", topFields, OUTERWEAR_OUTLINE, TOP_GUIDES),
  DRESS: template("DRESS", "Dress", "FULL_BODY", dressFields, DRESS_OUTLINE, DRESS_GUIDES),
  DRESS_SLEEVELESS: template("DRESS_SLEEVELESS", "Sleeveless dress", "FULL_BODY", [shoulderWidth, bustWidth, waistWidth, hipWidth, garmentLength], DRESS_SLEEVELESS_OUTLINE, DRESS_GUIDES),
  DRESS_SLEEVED: template("DRESS_SLEEVED", "Sleeved dress", "FULL_BODY", [shoulderWidth, bustWidth, waistWidth, hipWidth, garmentLength, sleeveLength], DRESS_SLEEVED_OUTLINE, DRESS_GUIDES),
  PANTS: template("PANTS", "Pants", "BOTTOM", pantsFields, PANTS_OUTLINE, PANTS_GUIDES),
  SHORTS: template("SHORTS", "Shorts", "BOTTOM", shortsFields, SHORTS_OUTLINE, PANTS_GUIDES),
  SKIRT: template("SKIRT", "Skirt", "BOTTOM", skirtFields, SKIRT_OUTLINE, SKIRT_GUIDES),
  KIDS_TOP: template("KIDS_TOP", "Kids top", "KIDS_TOP", topFields, KIDS_TOP_OUTLINE, TOP_GUIDES),
  TWO_PIECE_SET: template("TWO_PIECE_SET", "Two-piece set", "SET", twoPieceFields, TWO_PIECE_OUTLINE),
  GENERIC_TOP: template("GENERIC_TOP", "Generic top", "TOP", topFields, TOP_OUTLINE, TOP_GUIDES),
  GENERIC_BOTTOM: template("GENERIC_BOTTOM", "Generic bottom", "BOTTOM", [waistWidth, hipWidth, garmentLength, optionalInseam], PANTS_OUTLINE, PANTS_GUIDES),
  GENERIC_GARMENT: template("GENERIC_GARMENT", "Generic garment", "GARMENT", [garmentLength, chestWidth, waistWidth, hipWidth], GENERIC_GARMENT_OUTLINE)
};

export function selectProductDetailMeasurementTemplate(
  category?: string | null,
  subcategory?: string | null,
  sleeveType?: string | null
): ProductDetailMeasurementTemplate {
  const categoryToken = token(category);
  const subcategoryToken = token(subcategory);
  const value = `${categoryToken} ${subcategoryToken}`;
  const sleeveToken = token(sleeveType);

  if (matches(value, "TWO_PIECE", "TWO PIECE", "MATCHING_SET", "CO_ORD", "COORD", "SET")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.TWO_PIECE_SET;
  if (categoryToken === "KIDS" && !matches(subcategoryToken, "PANT", "SHORT", "SKIRT", "DRESS")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.KIDS_TOP;
  if (matches(value, "T_SHIRT", "TSHIRT", "T-SHIRT", "TEE")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.T_SHIRT;
  if (matches(value, "BLOUSE")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.BLOUSE;
  if (matches(value, "HOODIE", "HOODED")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.HOODIE;
  if (matches(value, "SWEATER", "JUMPER", "KNITWEAR", "CARDIGAN")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.SWEATER;
  if (matches(value, "OUTERWEAR", "JACKET", "COAT", "BLAZER")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.OUTERWEAR;
  if (matches(value, "DRESS")) {
    if (sleeveToken === "SLEEVELESS" || sleeveToken === "NOT_APPLICABLE") {
      return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.DRESS_SLEEVELESS;
    }
    if (sleeveToken && sleeveToken !== "OTHER" && sleeveToken !== "UNKNOWN") {
      return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.DRESS_SLEEVED;
    }
    return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.DRESS;
  }
  if (matches(value, "SHORT")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.SHORTS;
  if (matches(value, "PANT", "TROUSER", "JEAN")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.PANTS;
  if (matches(value, "SKIRT")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.SKIRT;
  if (matches(value, "SHIRT")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.SHIRT;
  if (matches(value, "TOP")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.GENERIC_TOP;
  if (matches(value, "BOTTOM")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.GENERIC_BOTTOM;
  return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.GENERIC_GARMENT;
}

export function resolveProductDetailMeasurements(
  template: ProductDetailMeasurementTemplate,
  measurements: Readonly<Record<string, number | null | undefined>>
): ResolvedProductDetailMeasurement[] {
  return template.measurementFields.flatMap((measurementField) => {
    const sourceKey = measurementField.sourceKeys.find((key) => Number.isFinite(measurements[key]));
    if (!sourceKey) return [];
    return [{ ...measurementField, sourceKey, valueCm: Number(measurements[sourceKey]) }];
  });
}

export function renderProductDetailMeasurementGuideSvg(input: {
  template: ProductDetailMeasurementTemplate;
  title: string;
  measurements: Readonly<Record<string, number | null | undefined>>;
  locale?: "en" | "sw" | "zh";
}): string {
  const locale = input.locale ?? "en";
  const values = resolveProductDetailMeasurements(input.template, input.measurements);
  const missingRequired = input.template.measurementFields.some((measurementField) =>
    measurementField.required && !values.some((value) => value.key === measurementField.key)
  );
  const rows = values.map((value, index) => `
      <g transform="translate(0 ${index * 66})">
        <circle cx="24" cy="0" r="18" fill="#1f6f5f"/>
        <text x="24" y="7" text-anchor="middle" class="marker">${String.fromCharCode(65 + index)}</text>
        <text x="58" y="7" class="row">${escapeXml(value.label)}</text>
        <text x="418" y="7" text-anchor="end" class="value">${formatCentimetres(value.valueCm)} cm</text>
      </g>`).join("");
  const diagramGuides = values.map((value, index) => {
    const guide = input.template.measurementGuides[value.key];
    if (!guide) return "";
    const marker = String.fromCharCode(65 + index);
    return `<path d="${guide.path}" class="measure-line"/><circle cx="${guide.markerX}" cy="${guide.markerY}" r="17" class="measure-badge"/><text x="${guide.markerX}" y="${guide.markerY + 6}" text-anchor="middle" class="diagram-marker">${marker}</text>`;
  }).join("");
  const note = missingRequired
    ? `<text x="700" y="970" class="note">Some measurements are not available.</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" role="img" lang="${locale}" data-template-code="${input.template.code}" data-template-version="${input.template.version}" data-measurement-count="${values.length}">
  <title>${escapeXml(input.template.name)} measurement guide</title>
  <style>
    .outline{fill:#f6f3ed;stroke:#555;stroke-width:5;stroke-linejoin:round}.outline .detail{fill:none;stroke:#777;stroke-width:4}.measure-line{fill:none;stroke:#1f6f5f;stroke-width:3;stroke-dasharray:10 9}.measure-badge{fill:#1f6f5f;stroke:none}.heading,.row,.value,.note,.meta,.marker,.diagram-marker{font-family:Arial,sans-serif}.heading{font-size:42px;fill:#171717}.eyebrow{font:700 22px Arial,sans-serif;letter-spacing:2px;fill:#1f6f5f}.row{font-size:25px;fill:#333}.value{font-size:25px;font-weight:700;fill:#171717}.marker,.diagram-marker{font-size:18px;font-weight:700;fill:#fff;stroke:none}.note,.meta{font-size:21px;fill:#686868}
  </style>
  <rect width="1200" height="1200" fill="#fff"/>
  <text x="72" y="82" class="eyebrow">MEASUREMENT GUIDE</text>
  <text x="72" y="145" class="heading">${escapeXml(input.title)}</text>
  <text x="72" y="188" class="meta">${escapeXml(input.template.name)} · flat garment measurements</text>
  <g class="outline" transform="translate(70 260) scale(.93)">${input.template.svgSource}${diagramGuides}</g>
  <g transform="translate(700 292)">${rows}</g>
  ${note}
  <text x="700" y="1030" class="note">Flat garment measurements in centimetres.</text>
  <text x="700" y="1066" class="note">Compare with a similar item you own.</text>
</svg>`;
}

function matches(value: string, ...needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function token(value?: string | null): string {
  return value?.trim().toUpperCase().replace(/[\s-]+/g, "_") ?? "";
}

function formatCentimetres(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;"
  })[character]!);
}
