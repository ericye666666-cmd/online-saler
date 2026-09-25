import { stringValue, type JsonRecord } from "./operations-workspace-flow";

export type LabelSize = "60x40" | "40x30";

export const DEFAULT_LABEL_SIZE: LabelSize = "60x40";
export const DEFAULT_PRINT_AGENT_URL = "http://127.0.0.1:8719";
export const DEFAULT_PRINTER_NAME = "Deli DL-720C";
export const PRINT_AGENT_DOWNLOAD_URL = "/downloads/direct-loop-print-agent.zip?v=windows-exe-1";
export const MACOS_PRINT_AGENT_DOWNLOAD_URL = "/downloads/direct-loop-print-agent-macos.zip?v=macos-source-2";

/**
 * The systems the helper can actually reach a printer from.
 *
 * This used to be Windows alone, and the check was worth keeping even so: the
 * helper answers /health from anywhere, so without it a Mac looked connected and
 * only failed at the moment somebody pressed print. Windows goes through the RAW
 * spooler, the others through `lp -o raw`; the bytes on the wire are the same.
 */
export const PRINT_AGENT_PLATFORMS = ["windows", "darwin", "linux"] as const;

export function isSupportedAgentPlatform(value: unknown): boolean {
  return typeof value === "string" && PRINT_AGENT_PLATFORMS.includes(value.toLowerCase() as typeof PRINT_AGENT_PLATFORMS[number]);
}

/**
 * Safari never reaches the helper: the console is https and the helper is plain
 * http on 127.0.0.1, which Safari blocks silently where Chrome asks for
 * local-network access. The helper can be running perfectly and Safari still
 * reports it missing, so name the browser instead of the helper. Chrome, Edge,
 * Opera and Firefox all carry their own token; only real Safari is left.
 */
export function isSafariBrowser(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return /Safari\//.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR|FxiOS|Firefox)\//.test(userAgent);
}

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
    location: string;
    raster?: { width: 480; height: 320; data: string };
  };
};

/** The agent's own validation: uppercase, digits and hyphens, 4 to 64 long. */
export const PRINTABLE_CODE = /^[A-Z0-9][A-Z0-9-]{3,63}$/;

export type FulfillmentLabelSource = {
  packageCode: string;
  nodeName: string;
  orderNumber: string;
  isDelivery: boolean;
  itemCount: number;
  customerName?: string | null;
};

/**
 * The parcel label for an online order.
 *
 * `template_scope` stays "online_saler_product" because the print agent
 * hard-rejects any other value, and there is no agent build to change on the
 * shop floor. It identifies the wire contract, not the contents: the agent
 * prints the raster and nothing else from this payload.
 */
export function buildFulfillmentLabelPayload(input: FulfillmentLabelSource & { printerName?: string }): LabelPrintPayload {
  const packageCode = input.packageCode.trim().toUpperCase();
  if (!PRINTABLE_CODE.test(packageCode)) {
    throw new Error("This parcel has no package code yet. Complete packing before printing.");
  }
  const printerName = input.printerName?.trim() || DEFAULT_PRINTER_NAME;
  const templateCode = "online_saler_product_60x40";
  return {
    printer_name: printerName,
    printer: printerName,
    copies: 1,
    template_size: "60x40",
    template_code: templateCode,
    template_scope: "online_saler_product",
    label_payload: {
      template_scope: "online_saler_product",
      template_code: templateCode,
      display_code: packageCode,
      machine_code: packageCode,
      barcode_value: packageCode,
      product_code: input.orderNumber,
      title: input.nodeName,
      category: input.isDelivery ? "Delivery" : "Customer pickup",
      color: "-",
      size: String(input.itemCount),
      condition: "-",
      location: input.nodeName
    }
  };
}

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

// The printed label is read by warehouse staff in Kenya, so it is always English,
// whatever language the screen is in. Stored codes such as LADY_TOPS or LIKE_NEW
// become "Lady tops" / "Like new".
export function labelText(value: string): string {
  if (!/^[A-Z0-9_]+$/.test(value) || !/[A-Z]/.test(value)) return value;
  const words = value.toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
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
  const category = labelText(stringValue(input.product.category)) || "-";
  const color = labelText(stringValue(input.product.color)) || "-";
  const size = stringValue(input.product.finalSizeLabel) || stringValue(input.product.tagSize) || "-";
  const condition = labelText(stringValue(input.product.conditionGrade)) || "-";
  const inventoryItem = input.product.inventoryItem && typeof input.product.inventoryItem === "object"
    ? input.product.inventoryItem as JsonRecord
    : {};
  const location = inventoryItem.location && typeof inventoryItem.location === "object"
    ? inventoryItem.location as JsonRecord
    : {};
  const locationCode = stringValue(location.locationCode) || "Unassigned";
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
      condition,
      location: locationCode
    }
  };
}
