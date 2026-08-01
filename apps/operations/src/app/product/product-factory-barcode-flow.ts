export type LabelScanProduct = {
  barcode?: string | null;
  labelPrintedAt?: string | Date | null;
  labelAppliedAt?: string | Date | null;
};

export function normalizeLabelScan(value: string): string {
  return value.trim().toUpperCase();
}

export function labelScanIssue(value: string, products: LabelScanProduct[]): string | null {
  const barcode = normalizeLabelScan(value);
  if (!barcode) return "请扫描 Barcode。";
  const product = products.find((item) => normalizeLabelScan(item.barcode ?? "") === barcode);
  if (!product) return "该 Barcode 不属于当前批次。";
  if (!product.labelPrintedAt) return "该标签尚未确认打印。";
  if (product.labelAppliedAt) return "该 Barcode 已经确认贴码，请勿重复扫描。";
  return null;
}
