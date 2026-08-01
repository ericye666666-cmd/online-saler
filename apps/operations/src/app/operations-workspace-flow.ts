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
  tagSize: string;
  sizeLabel: string;
  pattern: string;
  sleeveType: string;
  fitType: string;
  stretchLevel: string;
  fabricWeight: string;
  lengthCm: string;
  chestWidthCm: string;
  shoulderWidthCm: string;
  sleeveLengthCm: string;
  waistCm: string;
  hipCm: string;
  thighWidthCm: string;
  legOpeningCm: string;
  inseamCm: string;
  conditionGrade: string;
  priceKsh: string;
  defects: string;
  description: string;
};

export type WorkspaceReadiness = {
  needsPhoto: boolean;
  hasPhoto: boolean;
  hasAi: boolean;
  canSaveAndNext: boolean;
  label: string;
  reasons: string[];
};

export const emptyWorkspaceForm = (): WorkspaceForm => ({
  title: "",
  category: "TSHIRTS",
  subcategory: "TSHIRT",
  color: "BLACK",
  audience: "UNISEX",
  kidsAgeRange: "NOT_APPLICABLE",
  brand: "",
  tagSize: "",
  sizeLabel: "",
  pattern: "SOLID",
  sleeveType: "SHORT",
  fitType: "UNKNOWN",
  stretchLevel: "UNKNOWN",
  fabricWeight: "UNKNOWN",
  lengthCm: "",
  chestWidthCm: "",
  shoulderWidthCm: "",
  sleeveLengthCm: "",
  waistCm: "",
  hipCm: "",
  thighWidthCm: "",
  legOpeningCm: "",
  inseamCm: "",
  conditionGrade: "GOOD",
  priceKsh: "",
  defects: "",
  description: ""
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
    tagSize: stringValue(product?.tagSize) || stringField(ai, "sizeLabel") || form.tagSize,
    sizeLabel: stringValue(product?.finalSizeLabel) || stringField(ai, "sizeLabel") || form.sizeLabel,
    pattern: stringValue(product?.pattern) || stringField(ai, "pattern") || form.pattern,
    sleeveType: stringValue(product?.sleeveType) || stringField(ai, "sleeveType") || form.sleeveType,
    fitType: stringValue(product?.fitType) || form.fitType,
    stretchLevel: stringValue(product?.stretchLevel) || form.stretchLevel,
    fabricWeight: stringValue(product?.fabricWeight) || form.fabricWeight,
    conditionGrade: stringValue(product?.conditionGrade) || form.conditionGrade,
    priceKsh: typeof product?.priceKsh === "number" ? String(product.priceKsh) : form.priceKsh,
    description: stringValue(product?.description) || form.description
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
  const reasons = calibrationValidationReasons(input.form, { hasPhoto, hasAi });

  return {
    needsPhoto: !hasPhoto,
    hasPhoto,
    hasAi,
    canSaveAndNext: reasons.length === 0 && status !== "BARCODE_ASSIGNED",
    label: labelFor({ status, hasPhoto, hasAi, reasons }),
    reasons
  };
}

export function calibrationValidationReasons(
  form: WorkspaceForm,
  input: { hasPhoto?: boolean; hasAi?: boolean } = {}
): string[] {
  const reasons: string[] = [];
  if (input.hasPhoto === false) reasons.push("先上传商品照片。");
  if (input.hasAi === false) reasons.push("先完成 AI 识别。");
  const requiredFields: Array<[keyof WorkspaceForm, string]> = [
    ["title", "标题"],
    ["category", "分类"],
    ["subcategory", "子分类"],
    ["color", "颜色"],
    ["audience", "适用人群"],
    ["sizeLabel", "尺码"],
    ["conditionGrade", "成色"],
    ["fitType", "版型"],
    ["stretchLevel", "弹性"],
    ["fabricWeight", "面料厚度"],
    ["priceKsh", "价格"]
  ];
  for (const [field, label] of requiredFields) {
    if (!form[field].trim()) reasons.push(`${label}为必填项。`);
  }
  if (form.audience === "KIDS" && form.kidsAgeRange === "NOT_APPLICABLE") {
    reasons.push("儿童商品必须填写年龄段。");
  }
  for (const requirement of measurementRequirements(form)) {
    if (!positiveNumber(form[requirement.key])) {
      reasons.push(`${requirement.label}必须填写大于 0 的厘米数。`);
    }
  }
  if (!positiveInteger(form.priceKsh)) reasons.push("价格必须填写大于 0 的整数 KSh。");
  if (!form.defects.trim()) reasons.push("瑕疵必须确认；没有瑕疵请填写 None。");
  return reasons;
}

function labelFor(input: { status: string; hasPhoto: boolean; hasAi: boolean; reasons: string[] }): string {
  if (input.status === "BARCODE_ASSIGNED") return "Complete";
  if (!input.hasPhoto) return "Add photo";
  if (!input.hasAi) return "AI running";
  if (input.reasons.length > 0) return "Check required fields";
  return "Ready to save";
}

function positiveNumber(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function positiveInteger(value: string): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

export type MeasurementRequirement = {
  key:
    | "lengthCm"
    | "chestWidthCm"
    | "shoulderWidthCm"
    | "sleeveLengthCm"
    | "waistCm"
    | "hipCm"
    | "thighWidthCm"
    | "legOpeningCm"
    | "inseamCm";
  type:
    | "LENGTH"
    | "OUTSEAM"
    | "CHEST_WIDTH"
    | "SHOULDER_WIDTH"
    | "SLEEVE_LENGTH"
    | "WAIST"
    | "HIP"
    | "THIGH_WIDTH"
    | "LEG_OPENING"
    | "INSEAM";
  label: string;
  required: boolean;
};

export function measurementFields(
  form: Pick<WorkspaceForm, "category" | "subcategory" | "sleeveType">
): MeasurementRequirement[] {
  const isPants = form.category === "PANTS" || form.category === "SHORT" ||
    (form.category === "KIDS" && form.subcategory === "KIDS_PANTS");
  if (isPants) {
    return [
      { key: "lengthCm", type: "OUTSEAM", label: "裤长", required: true },
      { key: "waistCm", type: "WAIST", label: "腰宽", required: true },
      { key: "hipCm", type: "HIP", label: "臀宽", required: true },
      { key: "thighWidthCm", type: "THIGH_WIDTH", label: "大腿宽", required: true },
      { key: "legOpeningCm", type: "LEG_OPENING", label: "裤脚宽", required: true },
      { key: "inseamCm", type: "INSEAM", label: "内长", required: false }
    ];
  }

  if (["SHOES", "BAG", "OTHERS", "TEXTILE", "OTHER"].includes(form.category)) return [];

  const sleeveRequired = !["SLEEVELESS", "NOT_APPLICABLE"].includes(form.sleeveType);
  const upperBody: MeasurementRequirement[] = [
    { key: "lengthCm", type: "LENGTH", label: "衣长", required: true },
    { key: "chestWidthCm", type: "CHEST_WIDTH", label: "胸宽", required: true },
    { key: "shoulderWidthCm", type: "SHOULDER_WIDTH", label: "肩宽", required: true },
    { key: "sleeveLengthCm", type: "SLEEVE_LENGTH", label: "袖长", required: sleeveRequired }
  ];
  const isDress = form.category === "DRESSES" ||
    (form.category === "KIDS" && form.subcategory === "KIDS_DRESS");
  if (!isDress) return upperBody;
  return [
    ...upperBody,
    { key: "waistCm", type: "WAIST", label: "腰宽", required: true },
    { key: "hipCm", type: "HIP", label: "臀宽", required: true }
  ];
}

export function measurementRequirements(
  form: Pick<WorkspaceForm, "category" | "subcategory" | "sleeveType">
): MeasurementRequirement[] {
  return measurementFields(form).filter((item) => item.required);
}

export function buildCalibrationBody(input: {
  employeeId: string;
  extractionId: string;
  form: WorkspaceForm;
}) {
  const visibleMeasurements = measurementFields(input.form);
  const requiredMeasurements = visibleMeasurements.filter((item) => item.required);
  const missingMeasurement = requiredMeasurements.find((item) => !positiveNumber(input.form[item.key]));
  if (missingMeasurement) throw new Error(`${missingMeasurement.label} is required.`);

  const measurements = visibleMeasurements
    .filter((item) => positiveNumber(input.form[item.key]))
    .map((item) => ({ type: item.type, valueCm: Number(input.form[item.key]) }));

  const defectText = input.form.defects.trim();
  const hasNoDefects = /^none$/i.test(defectText);

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
    fitType: input.form.fitType.trim(),
    stretchLevel: input.form.stretchLevel.trim(),
    fabricWeight: input.form.fabricWeight.trim(),
    brand: input.form.brand.trim() || undefined,
    tagSize: input.form.tagSize.trim() || undefined,
    sizeLabel: input.form.sizeLabel.trim() || undefined,
    description: input.form.description.trim() || undefined,
    conditionGrade: input.form.conditionGrade,
    priceKsh: Number(input.form.priceKsh),
    measurements,
    defects: defectText && !hasNoDefects
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
