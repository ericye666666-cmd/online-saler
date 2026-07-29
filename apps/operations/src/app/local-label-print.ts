import { stringValue, type JsonRecord } from "./operations-workspace-flow";

export type LabelSize = "60x40" | "40x30";

export const DEFAULT_LABEL_SIZE: LabelSize = "60x40";
export const DEFAULT_PRINT_AGENT_URL = "http://127.0.0.1:8719";
export const DEFAULT_PRINTER_NAME = "Deli DL-720C";

export type LocalPrinter = {
  name: string;
  status?: string;
  available?: boolean;
};

export type LabelPrintPayload = {
  printer_name: string;
  printer: string;
  copies: number;
  template_size: LabelSize;
  template_code: string;
  template_scope: "online_saler_product";
  label_payload: {
    template_scope: "online_saler_product";
    template_code: string;
    display_code: string;
    machine_code: string;
    barcode_value: string;
    product_code: string;
    title: string;
    category: string;
    color: string;
    size: string;
    condition: string;
  };
};

export function normalizeLabelSize(value: string): LabelSize {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  if (normalized === "40x30" || normalized === "4030" || normalized === "40*30" || normalized === "40mmx30mm") {
    return "40x30";
  }
  return "60x40";
}

export function normalizePrinterName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isDeli720Printer(value: string): boolean {
  const normalized = normalizePrinterName(value);
  return normalized.includes("deli") && (normalized.includes("720") || normalized.includes("dl720"));
}

export function printerList(value: unknown): LocalPrinter[] {
  if (!Array.isArray(value)) return [];
  const printers: LocalPrinter[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      printers.push({ name: entry });
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as JsonRecord;
      const name = stringValue(record.name);
      if (!name) continue;
      printers.push({
        name,
        status: stringValue(record.status),
        available: typeof record.available === "boolean" ? record.available : undefined
      });
    }
  }
  return printers;
}

export function selectDeliPrinter(printers: LocalPrinter[], fallback = DEFAULT_PRINTER_NAME): string {
  const exact = printers.find((printer) => normalizePrinterName(printer.name) === normalizePrinterName(fallback));
  if (exact) return exact.name;

  const deli = printers.find((printer) => isDeli720Printer(printer.name));
  return deli?.name ?? fallback;
}

export function buildLabelPrintPayload(input: {
  product: JsonRecord;
  labelSize: LabelSize;
  printerName?: string;
}): LabelPrintPayload {
  const barcode = stringValue(input.product.barcode).trim();
  if (!barcode) {
    throw new Error("Generate the barcode before printing the label.");
  }

  const productCode = stringValue(input.product.productCode);
  const title = stringValue(input.product.title) || "Second-hand item";
  const category = stringValue(input.product.category) || "-";
  const color = stringValue(input.product.color) || "-";
  const size = stringValue(input.product.finalSizeLabel) || stringValue(input.product.tagSize) || "-";
  const condition = stringValue(input.product.conditionGrade) || "-";
  const templateCode = `online_saler_product_${input.labelSize}`;
  const printerName = input.printerName?.trim() || DEFAULT_PRINTER_NAME;

  return {
    printer_name: printerName,
    printer: printerName,
    copies: 1,
    template_size: input.labelSize,
    template_code: templateCode,
    template_scope: "online_saler_product",
    label_payload: {
      template_scope: "online_saler_product",
      template_code: templateCode,
      display_code: barcode,
      machine_code: barcode,
      barcode_value: barcode,
      product_code: productCode,
      title,
      category,
      color,
      size,
      condition
    }
  };
}
