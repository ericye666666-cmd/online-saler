export const PRODUCT_DETAIL_MEASUREMENT_TEMPLATE_VERSION = "measurement-guides-v3.0.0";

export type ProductDetailMeasurementTemplateCode =
  | "TOP_SLEEVELESS"
  | "TOP_SHORT_SLEEVE"
  | "TOP_LONG_SLEEVE"
  | "OUTERWEAR_JACKET"
  | "PANTS"
  | "SHORTS"
  | "SKIRT"
  | "DRESS_SLEEVELESS"
  | "DRESS_SHORT_SLEEVE"
  | "DRESS_LONG_SLEEVE"
  | "TWO_PIECE_SET"
  | "KIDS_TOP_SHORT_SLEEVE"
  | "KIDS_TOP_LONG_SLEEVE"
  | "KIDS_OUTERWEAR"
  | "KIDS_PANTS"
  | "KIDS_DRESS"
  | "KIDS_SKIRT"
  | "JUMPSUIT_ROMPER"
  | "BABY_ONESIE"
  | "BODYSUIT_SWIMWEAR"
  | "LONG_COAT_TRENCH"
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
const optionalLegOpening = field("legOpening", "Leg opening", ["LEG_OPENING"], false);
const rise = field("rise", "Rise", ["RISE"], false);
const bodyLength = field("bodyLength", "Body length", ["BODY_LENGTH", "SHOULDER_TO_CROTCH", "LENGTH", "GARMENT_LENGTH"]);

const sleevelessTopFields = [shoulderWidth, chestWidth, garmentLength, hemWidth] as const;
const shortSleeveTopFields = [shoulderWidth, chestWidth, sleeveLength, garmentLength, hemWidth] as const;
const longSleeveTopFields = [shoulderWidth, chestWidth, sleeveLength, garmentLength, hemWidth] as const;
const sleevelessDressFields = [shoulderWidth, bustWidth, waistWidth, hipWidth, garmentLength] as const;
const sleevedDressFields = [shoulderWidth, bustWidth, waistWidth, hipWidth, garmentLength, sleeveLength] as const;
const pantsFields = [waistWidth, hipWidth, thighWidth, inseam, outseam, legOpening, rise] as const;
const shortsFields = [waistWidth, hipWidth, thighWidth, field("rise", "Rise", ["RISE"]), inseam, legOpening] as const;
const skirtFields = [waistWidth, hipWidth, garmentLength, hemWidth] as const;
const jumpsuitFields = [shoulderWidth, bustWidth, waistWidth, hipWidth, garmentLength, optionalSleeveLength, optionalInseam, rise] as const;
const babyOnesieFields = [shoulderWidth, chestWidth, optionalSleeveLength, bodyLength, optionalLegOpening] as const;
const bodysuitFields = [bustWidth, waistWidth, hipWidth, bodyLength, optionalLegOpening] as const;
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
const DRESS_OUTLINE = `<path d="M145 62 215 30h90l70 32 92 82-65 84-57-45-18 155 112 267H81l112-267-18-155-57 45-65-84z"/><path d="M215 32q45 52 90 0M179 270h162M161 350h198" class="detail"/>`;
const DRESS_SLEEVELESS_OUTLINE = `<path d="M205 95 225 30h23l12 35 12-35h23l20 65 12 243 112 267H81l112-267z"/><path d="M225 30 260 65 295 30M192 270h136M164 350h192" class="detail"/>`;
const PANTS_OUTLINE = `<path d="M105 40h310l-25 565H275L250 285l-25 320H110z"/><path d="M105 86h310M122 205h276M250 86v199" class="detail"/>`;
const SHORTS_OUTLINE = `<path d="M105 55h310l-18 355H285l-35-170-35 170H103z"/><path d="M105 100h310M117 205h286M250 100v140" class="detail"/>`;
const SKIRT_OUTLINE = `<path d="M145 48h210l75 557H70z"/><path d="M145 95h210M118 250h264" class="detail"/>`;
const TWO_PIECE_OUTLINE = `<g transform="translate(-8 20) scale(.72)">${T_SHIRT_OUTLINE}</g><g transform="translate(255 150) scale(.58)">${PANTS_OUTLINE}</g>`;
const GENERIC_GARMENT_OUTLINE = `<path d="M180 58h160l70 90-46 100v357H156V248l-46-100z"/><path d="M180 60q80 70 160 0" class="detail"/>`;
const TOP_SLEEVELESS_OUTLINE = `<path d="M184 84 216 40h24q20 40 40 0h24l32 44 32 85-54 33 34 403H132l34-403-54-33z"/><path d="M216 40q44 58 88 0M166 235h188" class="detail"/>`;
const TOP_LONG_SLEEVE_OUTLINE = `<path d="M170 105 210 42h100l40 63 15 500H155z"/><path d="M170 105 110 135 40 500l78 16 60-310zM350 105l60 30 70 365-78 16-60-310z"/><path d="M210 44q50 55 100 0M155 555h210M44 480l78 16m276 0 78-16" class="detail"/>`;
const OUTERWEAR_JACKET_OUTLINE = `<path d="M168 105 208 40h104l40 65 18 500H150z"/><path d="M168 105 108 135 38 500l80 16 58-310zM352 105l60 30 70 365-80 16-58-310z"/><path d="m208 42 52 105 52-105M260 147v458M172 330h62v96h-62m176-96h-62v96h62M42 480l78 16m280 0 78-16" class="detail"/>`;
const DRESS_LONG_SLEEVE_OUTLINE = `<path d="M176 72 215 30h90l39 42 1 266 94 267H81l94-267z"/><path d="M176 72 122 95 60 390l72 16 50-235M344 72l54 23 62 295-72 16-50-235M215 32q45 52 90 0M177 270h166M160 350h200" class="detail"/>`;
const KIDS_TOP_SHORT_OUTLINE = `<path d="M170 140 220 105h80l50 35 80 65-54 70-45-35v300H189V240l-45 35-54-70z"/><path d="M222 107q38 40 76 0" class="detail"/>`;
const KIDS_TOP_LONG_OUTLINE = `<path d="M188 170 220 100h80l32 70v370H188z"/><path d="M188 170 130 195 78 455l62 13 52-235zM332 170l58 25 52 260-62 13-52-235z"/><path d="M222 102q38 40 76 0M188 510h144M82 438l62 13m232 0 62-13" class="detail"/>`;
const KIDS_OUTERWEAR_OUTLINE = `<path d="M186 170 218 98h84l32 72v370H186z"/><path d="M186 170 128 195 76 455l64 13 50-235zM334 170l58 25 52 260-64 13-50-235z"/><path d="m218 100 42 76 42-76M260 176v364M205 320h38v70h-38m110-70h-38v70h38M186 505h148M80 438l64 13m232 0 64-13" class="detail"/>`;
const KIDS_PANTS_OUTLINE = `<path d="M145 110h230l-22 430H275l-25-235-25 235h-78z"/><path d="M145 153h230M158 245h184M250 153v152" class="detail"/>`;
const KIDS_DRESS_OUTLINE = `<path d="M165 122 220 92h80l55 30 74 65-50 65-44-34-15 115 78 207H102l78-207-15-115-44 34-50-65z"/><path d="M222 94q38 42 76 0M180 292h155M155 352h205" class="detail"/>`;
const KIDS_SKIRT_OUTLINE = `<path d="M160 120h200l55 420H105z"/><path d="M160 162h200M136 285h248" class="detail"/>`;
const JUMPSUIT_OUTLINE = `<path d="M165 90 215 45h90l50 45 55 65-48 58-40-34-10 115 38 311H278l-28-245-28 245h-72l38-311-10-115-40 34-48-58z"/><path d="M217 47q43 48 86 0M182 238h136M175 294h150M250 294v66" class="detail"/>`;
const BABY_ONESIE_OUTLINE = `<path d="M170 145 220 105h80l50 40 70 60-50 65-38-30 20 150-52 40-50-90-50 90-52-40 20-150-38 30-50-65z"/><path d="M222 107q38 40 76 0M168 300h164M200 430q50 42 100 0" class="detail"/>`;
const BODYSUIT_OUTLINE = `<path d="M190 100 220 45h25q15 30 30 0h25l30 55-25 75 20 205-55 160-55-160 20-205z"/><path d="M220 47q30 44 60 0M205 225h90M200 305h100" class="detail"/>`;
const LONG_COAT_OUTLINE = `<path d="M156 110 205 38h110l49 72 60 495H96z"/><path d="M156 110 102 140 30 500l82 17 54-300zM364 110l54 30 72 360-82 17-54-300z"/><path d="m205 40 55 108 55-108M260 148v457M126 320h268M155 355h66v100h-66m210-100h-66v100h66M34 480l82 17m288 0 82-17" class="detail"/>`;

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

const LONG_TOP_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  shoulderWidth: { path: "M210 42H310", markerX: 260, markerY: 20 },
  chestWidth: { path: "M155 238H365", markerX: 388, markerY: 238 },
  bustWidth: { path: "M155 238H365", markerX: 388, markerY: 238 },
  sleeveLength: { path: "M350 105 480 500", markerX: 468, markerY: 330 },
  garmentLength: { path: "M132 42V605", markerX: 108, markerY: 325 },
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
  garmentLength: { path: "M82 40V605", markerX: 58, markerY: 325 },
  legOpening: { path: "M110 580H225", markerX: 168, markerY: 558 },
  rise: { path: "M250 86V285", markerX: 272, markerY: 185 }
};

const SKIRT_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  waistWidth: { path: "M145 48H355", markerX: 250, markerY: 25 },
  hipWidth: { path: "M118 250H382", markerX: 405, markerY: 250 },
  garmentLength: { path: "M45 48V605", markerX: 22, markerY: 325 },
  hemWidth: { path: "M70 580H430", markerX: 250, markerY: 558 }
};

const TOP_SLEEVELESS_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  shoulderWidth: { path: "M216 40H304", markerX: 260, markerY: 18 },
  chestWidth: { path: "M166 235H354", markerX: 377, markerY: 235 },
  bustWidth: { path: "M166 235H354", markerX: 377, markerY: 235 },
  garmentLength: { path: "M108 84V605", markerX: 84, markerY: 345 },
  hemWidth: { path: "M132 580H388", markerX: 260, markerY: 558 }
};

const KIDS_TOP_SHORT_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  shoulderWidth: { path: "M220 105H300", markerX: 260, markerY: 83 },
  chestWidth: { path: "M189 265H331", markerX: 354, markerY: 265 },
  bustWidth: { path: "M189 265H331", markerX: 354, markerY: 265 },
  sleeveLength: { path: "M350 140 430 205", markerX: 447, markerY: 213 },
  garmentLength: { path: "M145 105V540", markerX: 121, markerY: 330 },
  hemWidth: { path: "M189 515H331", markerX: 354, markerY: 515 }
};

const KIDS_TOP_LONG_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  shoulderWidth: { path: "M220 100H300", markerX: 260, markerY: 78 },
  chestWidth: { path: "M188 265H332", markerX: 355, markerY: 265 },
  bustWidth: { path: "M188 265H332", markerX: 355, markerY: 265 },
  sleeveLength: { path: "M332 170 442 455", markerX: 431, markerY: 325 },
  garmentLength: { path: "M164 100V540", markerX: 140, markerY: 325 },
  hemWidth: { path: "M188 515H332", markerX: 355, markerY: 515 }
};

const KIDS_PANTS_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  waistWidth: { path: "M145 110H375", markerX: 260, markerY: 88 },
  hipWidth: { path: "M158 245H342", markerX: 365, markerY: 245 },
  thighWidth: { path: "M158 320H232", markerX: 195, markerY: 298 },
  inseam: { path: "M250 305V540", markerX: 272, markerY: 425 },
  outseam: { path: "M122 110V540", markerX: 98, markerY: 330 },
  legOpening: { path: "M147 515H225", markerX: 186, markerY: 493 },
  rise: { path: "M250 153V305", markerX: 272, markerY: 229 }
};

const KIDS_DRESS_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  shoulderWidth: { path: "M220 92H300", markerX: 260, markerY: 70 },
  bustWidth: { path: "M165 250H355", markerX: 378, markerY: 250 },
  waistWidth: { path: "M180 292H335", markerX: 358, markerY: 292 },
  hipWidth: { path: "M155 352H360", markerX: 383, markerY: 352 },
  garmentLength: { path: "M78 92V540", markerX: 54, markerY: 320 },
  sleeveLength: { path: "M355 122 429 187", markerX: 446, markerY: 194 }
};

const KIDS_SKIRT_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  waistWidth: { path: "M160 120H360", markerX: 260, markerY: 98 },
  hipWidth: { path: "M136 285H384", markerX: 407, markerY: 285 },
  garmentLength: { path: "M82 120V540", markerX: 58, markerY: 335 },
  hemWidth: { path: "M105 515H415", markerX: 260, markerY: 493 }
};

const JUMPSUIT_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  shoulderWidth: { path: "M215 45H305", markerX: 260, markerY: 23 },
  bustWidth: { path: "M178 220H342", markerX: 365, markerY: 220 },
  waistWidth: { path: "M182 238H338", markerX: 361, markerY: 238 },
  hipWidth: { path: "M175 294H345", markerX: 368, markerY: 294 },
  garmentLength: { path: "M64 45V605", markerX: 40, markerY: 330 },
  sleeveLength: { path: "M355 90 410 155", markerX: 427, markerY: 163 },
  inseam: { path: "M250 360V605", markerX: 272, markerY: 485 },
  rise: { path: "M250 294V360", markerX: 272, markerY: 327 }
};

const BABY_ONESIE_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  shoulderWidth: { path: "M220 105H300", markerX: 260, markerY: 83 },
  chestWidth: { path: "M168 285H332", markerX: 355, markerY: 285 },
  sleeveLength: { path: "M350 145 420 205", markerX: 437, markerY: 213 },
  bodyLength: { path: "M145 105V430", markerX: 121, markerY: 270 },
  legOpening: { path: "M200 430 250 340", markerX: 214, markerY: 394 }
};

const BODYSUIT_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  bustWidth: { path: "M205 225H295", markerX: 318, markerY: 225 },
  waistWidth: { path: "M200 305H300", markerX: 323, markerY: 305 },
  hipWidth: { path: "M195 380H305", markerX: 328, markerY: 380 },
  bodyLength: { path: "M165 45V540", markerX: 141, markerY: 295 },
  legOpening: { path: "M195 380 250 540", markerX: 208, markerY: 462 }
};

const TWO_PIECE_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  topShoulderWidth: { path: "M147 50H212", markerX: 180, markerY: 28 },
  topChestWidth: { path: "M114 190H244", markerX: 267, markerY: 190 },
  topGarmentLength: { path: "M96 50V456", markerX: 72, markerY: 250 },
  topSleeveLength: { path: "M240 80 337 142", markerX: 354, markerY: 150 },
  bottomWaistWidth: { path: "M316 173H496", markerX: 406, markerY: 151 },
  bottomHipWidth: { path: "M325 269H487", markerX: 510, markerY: 269 },
  bottomGarmentLength: { path: "M304 173V501", markerX: 280, markerY: 337 },
  bottomInseam: { path: "M400 315V501", markerX: 422, markerY: 410 }
};

const GENERIC_GARMENT_GUIDES: Readonly<Record<string, ProductDetailMeasurementGuide>> = {
  garmentLength: { path: "M130 58V605", markerX: 106, markerY: 335 },
  chestWidth: { path: "M156 260H364", markerX: 387, markerY: 260 },
  waistWidth: { path: "M156 350H364", markerX: 387, markerY: 350 },
  hipWidth: { path: "M156 440H364", markerX: 387, markerY: 440 }
};

export const PRODUCT_DETAIL_MEASUREMENT_TEMPLATES: Readonly<Record<ProductDetailMeasurementTemplateCode, ProductDetailMeasurementTemplate>> = {
  TOP_SLEEVELESS: template("TOP_SLEEVELESS", "Sleeveless top", "TOP", sleevelessTopFields, TOP_SLEEVELESS_OUTLINE, TOP_SLEEVELESS_GUIDES),
  TOP_SHORT_SLEEVE: template("TOP_SHORT_SLEEVE", "Short-sleeve top", "TOP", shortSleeveTopFields, T_SHIRT_OUTLINE, TOP_GUIDES),
  TOP_LONG_SLEEVE: template("TOP_LONG_SLEEVE", "Long-sleeve top", "TOP", longSleeveTopFields, TOP_LONG_SLEEVE_OUTLINE, LONG_TOP_GUIDES),
  OUTERWEAR_JACKET: template("OUTERWEAR_JACKET", "Outerwear jacket", "OUTERWEAR", longSleeveTopFields, OUTERWEAR_JACKET_OUTLINE, LONG_TOP_GUIDES),
  PANTS: template("PANTS", "Pants", "BOTTOM", pantsFields, PANTS_OUTLINE, PANTS_GUIDES),
  SHORTS: template("SHORTS", "Shorts", "BOTTOM", shortsFields, SHORTS_OUTLINE, PANTS_GUIDES),
  SKIRT: template("SKIRT", "Skirt", "BOTTOM", skirtFields, SKIRT_OUTLINE, SKIRT_GUIDES),
  DRESS_SLEEVELESS: template("DRESS_SLEEVELESS", "Sleeveless dress", "FULL_BODY", sleevelessDressFields, DRESS_SLEEVELESS_OUTLINE, DRESS_GUIDES),
  DRESS_SHORT_SLEEVE: template("DRESS_SHORT_SLEEVE", "Short-sleeve dress", "FULL_BODY", sleevedDressFields, DRESS_OUTLINE, DRESS_GUIDES),
  DRESS_LONG_SLEEVE: template("DRESS_LONG_SLEEVE", "Long-sleeve dress", "FULL_BODY", sleevedDressFields, DRESS_LONG_SLEEVE_OUTLINE, DRESS_GUIDES),
  TWO_PIECE_SET: template("TWO_PIECE_SET", "Two-piece set", "SET", twoPieceFields, TWO_PIECE_OUTLINE, TWO_PIECE_GUIDES),
  KIDS_TOP_SHORT_SLEEVE: template("KIDS_TOP_SHORT_SLEEVE", "Kids short-sleeve top", "KIDS_TOP", shortSleeveTopFields, KIDS_TOP_SHORT_OUTLINE, KIDS_TOP_SHORT_GUIDES),
  KIDS_TOP_LONG_SLEEVE: template("KIDS_TOP_LONG_SLEEVE", "Kids long-sleeve top", "KIDS_TOP", longSleeveTopFields, KIDS_TOP_LONG_OUTLINE, KIDS_TOP_LONG_GUIDES),
  KIDS_OUTERWEAR: template("KIDS_OUTERWEAR", "Kids outerwear", "KIDS_OUTERWEAR", longSleeveTopFields, KIDS_OUTERWEAR_OUTLINE, KIDS_TOP_LONG_GUIDES),
  KIDS_PANTS: template("KIDS_PANTS", "Kids pants", "KIDS_BOTTOM", pantsFields, KIDS_PANTS_OUTLINE, KIDS_PANTS_GUIDES),
  KIDS_DRESS: template("KIDS_DRESS", "Kids dress", "KIDS_FULL_BODY", sleevedDressFields, KIDS_DRESS_OUTLINE, KIDS_DRESS_GUIDES),
  KIDS_SKIRT: template("KIDS_SKIRT", "Kids skirt", "KIDS_BOTTOM", skirtFields, KIDS_SKIRT_OUTLINE, KIDS_SKIRT_GUIDES),
  JUMPSUIT_ROMPER: template("JUMPSUIT_ROMPER", "Jumpsuit or romper", "FULL_BODY", jumpsuitFields, JUMPSUIT_OUTLINE, JUMPSUIT_GUIDES),
  BABY_ONESIE: template("BABY_ONESIE", "Baby onesie", "BABY_FULL_BODY", babyOnesieFields, BABY_ONESIE_OUTLINE, BABY_ONESIE_GUIDES),
  BODYSUIT_SWIMWEAR: template("BODYSUIT_SWIMWEAR", "Bodysuit or swimwear", "FULL_BODY", bodysuitFields, BODYSUIT_OUTLINE, BODYSUIT_GUIDES),
  LONG_COAT_TRENCH: template("LONG_COAT_TRENCH", "Long coat or trench", "OUTERWEAR", longSleeveTopFields, LONG_COAT_OUTLINE, LONG_TOP_GUIDES),
  GENERIC_TOP: template("GENERIC_TOP", "Generic top", "TOP", [shoulderWidth, chestWidth, optionalSleeveLength, garmentLength, hemWidth], TOP_OUTLINE, TOP_GUIDES),
  GENERIC_BOTTOM: template("GENERIC_BOTTOM", "Generic bottom", "BOTTOM", [waistWidth, hipWidth, garmentLength, optionalInseam], PANTS_OUTLINE, PANTS_GUIDES),
  GENERIC_GARMENT: template("GENERIC_GARMENT", "Generic garment", "GARMENT", [garmentLength, chestWidth, waistWidth, hipWidth], GENERIC_GARMENT_OUTLINE, GENERIC_GARMENT_GUIDES)
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
  const isKids = matches(value, "KIDS", "KID_", "CHILD", "BOYS", "GIRLS", "TODDLER", "BABY", "INFANT");
  const isBaby = matches(value, "BABY", "INFANT", "NEWBORN", "TODDLER");
  const isSleeveless = matches(sleeveToken, "SLEEVELESS", "NOT_APPLICABLE") ||
    matches(value, "SLEEVELESS", "TANK", "CAMISOLE", "VEST");
  const isLongSleeve = matches(sleeveToken, "LONG", "FULL") ||
    matches(value, "LONG_SLEEVE", "HOODIE", "HOODED", "SWEATER", "JUMPER", "KNITWEAR", "CARDIGAN");

  if (matches(value, "TWO_PIECE", "MATCHING_SET", "CO_ORD", "COORD", "SET")) {
    return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.TWO_PIECE_SET;
  }
  if (isBaby && matches(value, "ONESIE", "BABYGROW", "BODY_SUIT", "BODYSUIT", "ROMPER")) {
    return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.BABY_ONESIE;
  }
  if (matches(value, "JUMPSUIT", "ROMPER", "OVERALL", "DUNGAREE")) {
    return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.JUMPSUIT_ROMPER;
  }
  if (matches(value, "BODYSUIT", "BODY_SUIT", "SWIMSUIT", "ONE_PIECE_SWIM", "LEOTARD")) {
    return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.BODYSUIT_SWIMWEAR;
  }
  if (isKids) {
    if (matches(value, "DRESS")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.KIDS_DRESS;
    if (matches(value, "SKIRT")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.KIDS_SKIRT;
    if (matches(value, "PANT", "TROUSER", "JEAN", "SHORT")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.KIDS_PANTS;
    if (matches(value, "OUTERWEAR", "JACKET", "COAT", "BLAZER")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.KIDS_OUTERWEAR;
    return isLongSleeve
      ? PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.KIDS_TOP_LONG_SLEEVE
      : PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.KIDS_TOP_SHORT_SLEEVE;
  }
  if (matches(value, "TRENCH", "LONG_COAT", "OVERCOAT", "DUSTER")) {
    return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.LONG_COAT_TRENCH;
  }
  if (matches(value, "OUTERWEAR", "JACKET", "COAT", "BLAZER")) {
    return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.OUTERWEAR_JACKET;
  }
  if (matches(value, "DRESS")) {
    if (isSleeveless) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.DRESS_SLEEVELESS;
    return isLongSleeve
      ? PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.DRESS_LONG_SLEEVE
      : PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.DRESS_SHORT_SLEEVE;
  }
  if (matches(value, "SHORT")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.SHORTS;
  if (matches(value, "PANT", "TROUSER", "JEAN")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.PANTS;
  if (matches(value, "SKIRT")) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.SKIRT;
  if (matches(value, "T_SHIRT", "TSHIRT", "TEE", "SHIRT", "BLOUSE")) {
    if (isSleeveless) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.TOP_SLEEVELESS;
    return isLongSleeve
      ? PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.TOP_LONG_SLEEVE
      : PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.TOP_SHORT_SLEEVE;
  }
  if (matches(value, "TOP")) {
    if (isSleeveless) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.TOP_SLEEVELESS;
    if (isLongSleeve) return PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.TOP_LONG_SLEEVE;
    return sleeveToken && !matches(sleeveToken, "OTHER", "UNKNOWN")
      ? PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.TOP_SHORT_SLEEVE
      : PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.GENERIC_TOP;
  }
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
  const displayTitle = formatMeasurementGuideDisplayTitle(input.title, input.template.name);
  const values = resolveProductDetailMeasurements(input.template, input.measurements);
  const missingRequired = input.template.measurementFields.some((measurementField) =>
    measurementField.required && !values.some((value) => value.key === measurementField.key)
  );
  const rows = values.map((value, index) => `
      <g transform="translate(0 ${index * 66})">
        <circle cx="24" cy="0" r="17" fill="#2f766d"/>
        <text x="24" y="7" text-anchor="middle" class="marker">${String.fromCharCode(65 + index)}</text>
        <text x="58" y="7" class="row">${escapeXml(value.label)}</text>
        <text x="418" y="7" text-anchor="end" class="value">${formatCentimetres(value.valueCm)} cm</text>
        <line x1="0" y1="31" x2="418" y2="31" class="separator"/>
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
    .outline{fill:#faf9f6;stroke:#5f5f5f;stroke-width:4;stroke-linejoin:round;stroke-linecap:round}.outline .detail{fill:none;stroke:#777;stroke-width:3}.measure-line{fill:none;stroke:#2f766d;stroke-width:3;stroke-dasharray:9 8}.measure-badge{fill:#2f766d;stroke:none}.heading,.row,.value,.note,.meta,.marker,.diagram-marker,.table-heading{font-family:Arial,Helvetica,sans-serif}.heading{font-size:40px;font-weight:500;fill:#171717}.eyebrow{font:700 20px Arial,Helvetica,sans-serif;letter-spacing:2px;fill:#2f766d}.table-heading{font-size:18px;font-weight:700;letter-spacing:1.5px;fill:#2f766d}.row{font-size:24px;fill:#555}.value{font-size:24px;font-weight:600;fill:#171717}.marker,.diagram-marker{font-size:17px;font-weight:700;fill:#fff;stroke:none}.note,.meta{font-size:20px;fill:#707070}.separator{stroke:#e4e4e4;stroke-width:1}
  </style>
  <rect width="1200" height="1200" fill="#fff"/>
  <rect x="24" y="24" width="1152" height="1152" rx="16" fill="none" stroke="#e1e1e1" stroke-width="2"/>
  <text x="72" y="82" class="eyebrow">MEASUREMENT GUIDE</text>
  <text x="72" y="145" class="heading">${escapeXml(displayTitle)}</text>
  <text x="72" y="188" class="meta">${escapeXml(input.template.name)} · flat garment measurements</text>
  <text x="700" y="246" class="table-heading">MEASUREMENTS</text>
  <line x1="700" y1="262" x2="1118" y2="262" class="separator"/>
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

function formatMeasurementGuideDisplayTitle(title: string, templateName: string): string {
  const supportedTitle = title
    .replace(/[^\u0020-\u007e]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return supportedTitle || `${templateName} measurements`;
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
