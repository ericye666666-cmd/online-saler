export type JsonRecord = Record<string, unknown>;

export type StepStatus = "Pending" | "Ready" | "Done";

type NullableRecord = JsonRecord | null;

export type DigitizationFlowInput = {
  employeeId: string;
  product: NullableRecord;
  image: NullableRecord;
  job: NullableRecord;
  barcode: NullableRecord;
};

export type DigitizationFlowState = {
  ids: {
    productId: string;
    imageId: string;
    extractionId: string;
  };
  productStatus: string;
  jobStatus: string;
  hasEmployee: boolean;
  hasBarcode: boolean;
  canCreateProduct: boolean;
  canSaveImage: boolean;
  canRunMockAI: boolean;
  canConfirmCalibration: boolean;
  canGenerateBarcode: boolean;
  steps: {
    create: StepStatus;
    image: StepStatus;
    ai: StepStatus;
    calibration: StepStatus;
    barcode: StepStatus;
  };
};

const CALIBRATED_STATUSES = new Set(["CALIBRATED", "BARCODE_ASSIGNED"]);

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function stepStatus(done: boolean, ready: boolean): StepStatus {
  if (done) return "Done";
  if (ready) return "Ready";
  return "Pending";
}

export function getDigitizationFlowState(input: DigitizationFlowInput): DigitizationFlowState {
  const productId = stringValue(input.product?.id);
  const imageId = stringValue(input.image?.id);
  const extractionId = stringValue(input.job?.extractionId);
  const productStatus = stringValue(input.product?.status);
  const jobStatus = stringValue(input.job?.status);
  const hasEmployee = isNonEmpty(input.employeeId);
  const productBarcode = stringValue(input.product?.barcode);
  const barcodeValue = stringValue(input.barcode?.barcode);
  const hasProduct = isNonEmpty(productId);
  const hasImage = isNonEmpty(imageId);
  const hasSuccessfulJob = jobStatus === "SUCCEEDED" && isNonEmpty(extractionId);
  const isCalibratedOrBeyond = CALIBRATED_STATUSES.has(productStatus);
  const hasBarcode = isNonEmpty(barcodeValue) || isNonEmpty(productBarcode) || productStatus === "BARCODE_ASSIGNED";

  const canCreateProduct = hasEmployee && !hasProduct;
  const canSaveImage = hasProduct && !hasImage;
  const canRunMockAI = hasImage && !hasSuccessfulJob;
  const canConfirmCalibration =
    hasSuccessfulJob && hasEmployee && !isCalibratedOrBeyond;
  const canGenerateBarcode =
    hasEmployee && productStatus === "CALIBRATED" && !hasBarcode;

  return {
    ids: {
      productId,
      imageId,
      extractionId
    },
    productStatus,
    jobStatus,
    hasEmployee,
    hasBarcode,
    canCreateProduct,
    canSaveImage,
    canRunMockAI,
    canConfirmCalibration,
    canGenerateBarcode,
    steps: {
      create: stepStatus(hasProduct, canCreateProduct),
      image: stepStatus(hasImage, canSaveImage),
      ai: stepStatus(hasSuccessfulJob, canRunMockAI),
      calibration: stepStatus(isCalibratedOrBeyond, canConfirmCalibration),
      barcode: stepStatus(hasBarcode, canGenerateBarcode)
    }
  };
}
