export type JsonRecord = Record<string, unknown>;

export const STAGING_TEST_EMPLOYEE_ID = "00000000-0000-4000-8000-000000000001";

export type WorkspaceForm = {
  title: string;
  category: string;
  subcategory: string;
  color: string;
  audience: string;
  kidsAgeRange: string;
  brand: string;
  sizeLabel: string;
  pattern: string;
  sleeveType: string;
  lengthCm: string;
  chestWidthCm: string;
  shoulderWidthCm: string;
  waistCm: string;
  hipCm: string;
  conditionGrade: string;
  defects: string;
};

export type WorkspaceReadiness = {
  needsPhoto: boolean;
  hasPhoto: boolean;
  hasAi: boolean;
  canSaveAndNext: boolean;
  label: string;
};

export const emptyWorkspaceForm = (): WorkspaceForm => ({
  title: "",
  category: "TSHIRTS",
  subcategory: "TSHIRT",
  color: "BLACK",
  audience: "UNISEX",
  kidsAgeRange: "NOT_APPLICABLE",
  brand: "",
  sizeLabel: "",
  pattern: "SOLID",
  sleeveType: "SHORT",
  lengthCm: "",
  chestWidthCm: "",
  shoulderWidthCm: "",
  waistCm: "",
  hipCm: "",
  conditionGrade: "GOOD",
  defects: ""
});

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringField(source: JsonRecord | null, key: string): string {
  const field = record(source?.[key]);
  const value = field?.value;
  return typeof value === "string" ? value : "";
}

export function normalizedAiOutput(job: JsonRecord | null): JsonRecord | null {
  return record(job?.normalizedOutput) ?? record(job?.normalizedOutputJson);
}

export function formFromProductAndAi(product: JsonRecord | null, job: JsonRecord | null): WorkspaceForm {
  const ai = normalizedAiOutput(job);
  const form = emptyWorkspaceForm();

  return {
    ...form,
    title: stringValue(product?.title) || stringField(ai, "title") || form.title,
    category: categoryValue(stringValue(product?.category) || stringField(ai, "category") || form.category),
    subcategory: stringValue(product?.subcategory) || stringField(ai, "subcategory") || form.subcategory,
    color: stringValue(product?.color) || stringField(ai, "primaryColor") || form.color,
    audience: stringValue(product?.gender) || stringField(ai, "audience") || form.audience,
    kidsAgeRange: stringValue(product?.kidsAgeRange) || stringField(ai, "kidsAgeRange") || form.kidsAgeRange,
    brand: stringValue(product?.brand) || stringField(ai, "brandLabel") || form.brand,
    sizeLabel: stringValue(product?.finalSizeLabel) || stringField(ai, "sizeLabel") || form.sizeLabel,
    pattern: stringField(ai, "pattern") || form.pattern,
    sleeveType: stringField(ai, "sleeveType") || form.sleeveType,
    conditionGrade: stringValue(product?.conditionGrade) || form.conditionGrade
  };
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function categoryValue(value: string): string {
  const legacy: Record<string, string> = {
    TOP: "LADY_TOPS",
    SHIRT: "SHIRTS",
    TROUSER: "PANTS",
    SKIRT: "DRESSES",
    DRESS: "DRESSES",
    JACKET: "JACKETS",
    SWEATER: "JACKETS",
    SHORTS: "SHORT",
    KIDS_WEAR: "KIDS"
  };
  return legacy[value] ?? value;
}

export function workspaceReadiness(input: {
  product: JsonRecord | null;
  image: JsonRecord | null;
  job: JsonRecord | null;
  form: WorkspaceForm;
}): WorkspaceReadiness {
  const status = stringValue(input.product?.status);
  const hasPhoto = Boolean(input.image?.id) || ["PHOTOGRAPHED", "AI_PROCESSING", "CALIBRATION_PENDING", "CALIBRATED", "BARCODE_ASSIGNED"].includes(status);
  const hasAi = stringValue(input.job?.status) === "SUCCEEDED" || Boolean(normalizedAiOutput(input.job));
  const hasMeasurements = positiveNumber(input.form.lengthCm) && positiveNumber(input.form.chestWidthCm);
  const hasRequiredFields = [
    input.form.title,
    input.form.category,
    input.form.subcategory,
    input.form.color,
    input.form.audience,
    input.form.sizeLabel,
    input.form.conditionGrade
  ].every((value) => value.trim().length > 0);
  const hasKidsAge = input.form.audience !== "KIDS" || input.form.kidsAgeRange !== "NOT_APPLICABLE";

  return {
    needsPhoto: !hasPhoto,
    hasPhoto,
    hasAi,
    canSaveAndNext: hasPhoto && hasAi && hasMeasurements && hasRequiredFields && hasKidsAge && status !== "BARCODE_ASSIGNED",
    label: labelFor({ status, hasPhoto, hasAi, hasMeasurements, hasRequiredFields, hasKidsAge })
  };
}

function labelFor(input: {
  status: string;
  hasPhoto: boolean;
  hasAi: boolean;
  hasMeasurements: boolean;
  hasRequiredFields: boolean;
  hasKidsAge: boolean;
}): string {
  if (input.status === "BARCODE_ASSIGNED") return "Complete";
  if (!input.hasPhoto) return "Add photo";
  if (!input.hasAi) return "AI running";
  if (!input.hasRequiredFields) return "Check AI fields";
  if (!input.hasKidsAge) return "Add kids age";
  if (!input.hasMeasurements) return "Add measurements";
  return "Ready to save";
}

function positiveNumber(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function buildCalibrationBody(input: {
  employeeId: string;
  extractionId: string;
  form: WorkspaceForm;
}) {
  const length = Number(input.form.lengthCm);
  const chest = Number(input.form.chestWidthCm);
  const optionalMeasurements = [
    { type: "SHOULDER_WIDTH", value: input.form.shoulderWidthCm },
    { type: "WAIST", value: input.form.waistCm },
    { type: "HIP", value: input.form.hipCm }
  ]
    .filter((item) => positiveNumber(item.value))
    .map((item) => ({ type: item.type, valueCm: Number(item.value) }));

  if (!positiveNumber(input.form.lengthCm) || !positiveNumber(input.form.chestWidthCm)) {
    throw new Error("Length and chest width are required.");
  }

  const defectText = input.form.defects.trim();

  return {
    employeeId: input.employeeId,
    extractionId: input.extractionId,
    title: input.form.title.trim(),
    category: input.form.category.trim(),
    subcategory: input.form.subcategory.trim(),
    color: input.form.color.trim(),
    gender: input.form.audience.trim(),
    kidsAgeRange: input.form.audience === "KIDS" ? input.form.kidsAgeRange.trim() : undefined,
    pattern: input.form.pattern.trim(),
    sleeveType: input.form.sleeveType.trim(),
    brand: input.form.brand.trim() || undefined,
    sizeLabel: input.form.sizeLabel.trim() || undefined,
    conditionGrade: input.form.conditionGrade,
    measurements: [
      { type: "LENGTH", valueCm: length },
      { type: "CHEST_WIDTH", valueCm: chest },
      ...optionalMeasurements
    ],
    defects: defectText
      ? [
          {
            type: "OTHER",
            severity: "MINOR",
            description: defectText
          }
        ]
      : []
  };
}
