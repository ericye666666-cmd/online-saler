import { requiredProductMeasurementTypes } from "@online-saler/business-rules";

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
  ukSizeLabel: string;
  pattern: string;
  sleeveType: string;
  fitType: string;
  stretchLevel: string;
  fabricWeight: string;
  material: string;
  tags: string[];
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
};

export type WorkspaceReadiness = {
  needsPhoto: boolean;
  hasPhoto: boolean;
  hasAi: boolean;
  canSaveAndNext: boolean;
  label: string;
  reasons: string[];
};

export type CalibrationValidationIssue = {
  field: keyof WorkspaceForm | "photo" | "ai";
  label: string;
  message: string;
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
  ukSizeLabel: "",
  pattern: "SOLID",
  sleeveType: "SHORT",
  fitType: "UNKNOWN",
  stretchLevel: "UNKNOWN",
  fabricWeight: "UNKNOWN",
  material: "UNKNOWN",
  tags: [],
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

function stringArrayField(source: JsonRecord | null, key: string): string[] {
  const field = record(source?.[key]);
  return stringArray(field?.value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
    ukSizeLabel: stringValue(product?.ukSizeLabel) || stringField(ai, "ukSizeLabel") || form.ukSizeLabel,
    pattern: stringValue(product?.pattern) || stringField(ai, "pattern") || form.pattern,
    sleeveType: stringValue(product?.sleeveType) || stringField(ai, "sleeveType") || form.sleeveType,
    fitType: stringValue(product?.fitType) || form.fitType,
    stretchLevel: stringValue(product?.stretchLevel) || form.stretchLevel,
    fabricWeight: stringValue(product?.fabricWeight) || form.fabricWeight,
    material: stringValue(product?.material) || stringField(ai, "material") || form.material,
    tags: stringArray(product?.tags).length ? stringArray(product?.tags) : stringArrayField(ai, "tags"),
    conditionGrade: stringValue(product?.conditionGrade) || form.conditionGrade,
    priceKsh: typeof product?.priceKsh === "number" ? String(product.priceKsh) : form.priceKsh
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
  return calibrationValidationIssues(form, input).map((issue) => issue.message);
}

export function calibrationValidationIssues(
  form: WorkspaceForm,
  input: { hasPhoto?: boolean; hasAi?: boolean } = {}
): CalibrationValidationIssue[] {
  const issues: CalibrationValidationIssue[] = [];
  if (input.hasPhoto === false) issues.push({ field: "photo", label: "商品照片", message: "先上传商品照片。" });
  if (input.hasAi === false) issues.push({ field: "ai", label: "AI 识别", message: "先完成 AI 识别。" });
  const requiredFields: Array<[Exclude<keyof WorkspaceForm, "tags">, string]> = [
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
    ["material", "面料"],
    ["priceKsh", "价格"]
  ];
  for (const [field, label] of requiredFields) {
    if (!form[field].trim()) issues.push({ field, label, message: `${label}为必填项。` });
  }
  if (form.audience === "KIDS" && form.kidsAgeRange === "NOT_APPLICABLE") {
    issues.push({ field: "kidsAgeRange", label: "儿童年龄段", message: "儿童商品必须填写年龄段。" });
  }
  for (const requirement of measurementRequirements(form)) {
    if (!positiveNumber(form[requirement.key])) {
      issues.push({
        field: requirement.key,
        label: requirement.label,
        message: `${requirement.label}必须填写大于 0 的厘米数。`
      });
    }
  }
  if (form.priceKsh.trim() && !positiveInteger(form.priceKsh)) {
    issues.push({ field: "priceKsh", label: "价格", message: "价格必须填写大于 0 的整数 KSh。" });
  }
  if (!form.defects.trim()) {
    issues.push({ field: "defects", label: "瑕疵", message: "瑕疵必须确认；没有瑕疵请填写 None。" });
  }
  return issues;
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
  const requiredTypes = new Set(requiredProductMeasurementTypes(form));
  const isPants = form.category === "PANTS" || form.category === "SHORT" ||
    (form.category === "KIDS" && form.subcategory === "KIDS_PANTS");
  if (isPants) {
    return [
      { key: "lengthCm", type: "OUTSEAM", label: "裤长", required: requiredTypes.has("OUTSEAM") },
      { key: "waistCm", type: "WAIST", label: "腰宽", required: requiredTypes.has("WAIST") },
      { key: "hipCm", type: "HIP", label: "臀宽", required: requiredTypes.has("HIP") },
      { key: "thighWidthCm", type: "THIGH_WIDTH", label: "大腿宽", required: requiredTypes.has("THIGH_WIDTH") },
      { key: "legOpeningCm", type: "LEG_OPENING", label: "裤脚宽", required: requiredTypes.has("LEG_OPENING") },
      { key: "inseamCm", type: "INSEAM", label: "内长", required: false }
    ];
  }

  if (["SHOES", "BAG", "OTHERS", "TEXTILE", "OTHER"].includes(form.category)) return [];

  const upperBody: MeasurementRequirement[] = [
    { key: "lengthCm", type: "LENGTH", label: "衣长", required: requiredTypes.has("LENGTH") },
    { key: "chestWidthCm", type: "CHEST_WIDTH", label: "胸宽", required: requiredTypes.has("CHEST_WIDTH") },
    { key: "shoulderWidthCm", type: "SHOULDER_WIDTH", label: "肩宽", required: requiredTypes.has("SHOULDER_WIDTH") },
    { key: "sleeveLengthCm", type: "SLEEVE_LENGTH", label: "袖长", required: requiredTypes.has("SLEEVE_LENGTH") }
  ];
  const isDress = form.category === "DRESSES" ||
    (form.category === "KIDS" && form.subcategory === "KIDS_DRESS");
  if (!isDress) return upperBody;
  return [
    ...upperBody,
    { key: "waistCm", type: "WAIST", label: "腰宽", required: requiredTypes.has("WAIST") },
    { key: "hipCm", type: "HIP", label: "臀宽", required: requiredTypes.has("HIP") }
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
    material: input.form.material.trim(),
    tags: input.form.tags,
    brand: input.form.brand.trim() || undefined,
    tagSize: input.form.tagSize.trim() || undefined,
    sizeLabel: input.form.sizeLabel.trim() || undefined,
    ukSizeLabel: input.form.ukSizeLabel.trim() || undefined,
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
