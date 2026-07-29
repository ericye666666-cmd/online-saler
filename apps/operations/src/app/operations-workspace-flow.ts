export type JsonRecord = Record<string, unknown>;

export const STAGING_TEST_EMPLOYEE_ID = "00000000-0000-4000-8000-000000000001";

export type WorkspaceForm = {
  title: string;
  category: string;
  color: string;
  brand: string;
  sizeLabel: string;
  pattern: string;
  sleeveType: string;
  lengthCm: string;
  chestWidthCm: string;
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
  category: "DRESS",
  color: "BLACK",
  brand: "",
  sizeLabel: "",
  pattern: "SOLID",
  sleeveType: "SHORT",
  lengthCm: "",
  chestWidthCm: "",
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
    category: stringValue(product?.category) || stringField(ai, "category") || form.category,
    color: stringValue(product?.color) || stringField(ai, "primaryColor") || form.color,
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
    input.form.color,
    input.form.sizeLabel,
    input.form.conditionGrade
  ].every((value) => value.trim().length > 0);

  return {
    needsPhoto: !hasPhoto,
    hasPhoto,
    hasAi,
    canSaveAndNext: hasPhoto && hasAi && hasMeasurements && hasRequiredFields && status !== "BARCODE_ASSIGNED",
    label: labelFor({ status, hasPhoto, hasAi, hasMeasurements, hasRequiredFields })
  };
}

function labelFor(input: {
  status: string;
  hasPhoto: boolean;
  hasAi: boolean;
  hasMeasurements: boolean;
  hasRequiredFields: boolean;
}): string {
  if (input.status === "BARCODE_ASSIGNED") return "Complete";
  if (!input.hasPhoto) return "Add photo";
  if (!input.hasAi) return "AI running";
  if (!input.hasRequiredFields) return "Check AI fields";
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

  if (!positiveNumber(input.form.lengthCm) || !positiveNumber(input.form.chestWidthCm)) {
    throw new Error("Length and chest width are required.");
  }

  const defectText = input.form.defects.trim();

  return {
    employeeId: input.employeeId,
    extractionId: input.extractionId,
    title: input.form.title.trim(),
    category: input.form.category.trim(),
    color: input.form.color.trim(),
    pattern: input.form.pattern.trim(),
    sleeveType: input.form.sleeveType.trim(),
    brand: input.form.brand.trim() || undefined,
    sizeLabel: input.form.sizeLabel.trim() || undefined,
    conditionGrade: input.form.conditionGrade,
    measurements: [
      { type: "LENGTH", valueCm: length },
      { type: "CHEST_WIDTH", valueCm: chest }
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
