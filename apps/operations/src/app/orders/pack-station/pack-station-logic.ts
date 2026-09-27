/**
 * The decisions behind the packing station (打包台), kept apart from the screen
 * so they can be tested without a browser.
 *
 * The station adds no state of its own. Every step it shows is read off the
 * order's existing fulfillment status, and every button calls an endpoint the
 * order centre already uses — claim-picking, items/:id/scan, start-packing,
 * complete-packing, package-label-printed, send-to-node, ready-for-pickup and
 * ready-for-dispatch. What lives here is only "which of those comes next".
 */

type NodeLike = { id?: string; name?: string; type: string } | null | undefined;

export type PackStationItem = {
  id: string;
  snapshot?: { title?: string | null; barcode?: string | null } | null;
  inventoryItem?: { barcode?: string | null } | null;
};

export type PackStationOrder = {
  id: string;
  orderNumber: string;
  fulfillmentMethod: string;
  fulfillmentNode?: NodeLike;
  items: PackStationItem[];
  fulfillment?: {
    status: string;
    assignedPickerEmployeeId?: string | null;
    assignedPackerEmployeeId?: string | null;
    packingStartedAt?: string | null;
    packageCode?: string | null;
    packageLabelPrintedAt?: string | null;
    fulfillmentNode?: NodeLike;
    items: Array<{ orderItemId: string; status: string; expectedBarcode?: string | null }>;
  } | null;
};

/** Where the order is on the station's four steps. */
export type PackStationStep = "scan" | "details" | "print" | "send" | "gone";

/** Same normalisation as the API (normalizeScannedBarcode), so the screen and the server agree on a match. */
export function normalizeBarcode(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * The barcode the server checks a scan against, in the server's own order of
 * preference: the one frozen on the picking task, then the order snapshot, then
 * the live inventory record.
 */
export function expectedBarcodeFor(order: PackStationOrder, item: PackStationItem): string {
  const task = order.fulfillment?.items.find((candidate) => candidate.orderItemId === item.id);
  return task?.expectedBarcode || item.snapshot?.barcode || item.inventoryItem?.barcode || "";
}

export function isItemVerified(order: PackStationOrder, itemId: string): boolean {
  return order.fulfillment?.items.find((candidate) => candidate.orderItemId === itemId)?.status === "VERIFIED";
}

/** Garments of this order still to be scanned. Empty once the order is ready to pack. */
export function remainingItems<T extends PackStationOrder>(order: T): T["items"] {
  if (!order.fulfillment) return order.items;
  if (order.fulfillment.status !== "PAID" && order.fulfillment.status !== "PICKING") return [];
  return order.items.filter((item) => !isItemVerified(order, item.id));
}

export function destinationNode(order: PackStationOrder): NodeLike {
  return order.fulfillment?.fulfillmentNode ?? order.fulfillmentNode ?? null;
}

/** No destination yet: it has to be chosen before packing completes, or no package code is minted. */
export function needsDestination(order: PackStationOrder): boolean {
  return !destinationNode(order);
}

/** A parcel bound for a store carries a routing sticker; one handed over at the warehouse does not. */
export function needsLabel(order: PackStationOrder): boolean {
  return destinationNode(order)?.type === "STORE";
}

export function packStationStep(order: PackStationOrder): PackStationStep {
  const status = order.fulfillment?.status ?? "PAID";
  if (status === "PAID" || status === "PICKING") return "scan";
  if (status === "READY_TO_PACK") return "details";
  if (status === "PACKED") {
    if (needsLabel(order) && !order.fulfillment?.packageLabelPrintedAt) return "print";
    return "send";
  }
  return "gone";
}

export type HandoverAction = {
  /** The existing order endpoint to call. */
  action: "send-to-node" | "ready-for-pickup" | "ready-for-dispatch";
  /** The permission the API checks for that endpoint. */
  permission: "orders.assign-node" | "orders.pack" | "orders.assign-rider";
};

/**
 * The one button of step 4. A store-bound parcel is sent to the store
 * (发往门店); a parcel handed over at the warehouse itself moves straight to
 * its handover state — the same transitions the order centre offers.
 */
export function handoverFor(order: PackStationOrder): HandoverAction | null {
  const node = destinationNode(order);
  if (!node) return null;
  if (node.type === "STORE") return { action: "send-to-node", permission: "orders.assign-node" };
  if (order.fulfillmentMethod === "PICKUP") return { action: "ready-for-pickup", permission: "orders.pack" };
  return { action: "ready-for-dispatch", permission: "orders.assign-rider" };
}

export type BarcodeMatch<T extends PackStationOrder> =
  | { kind: "match"; order: T; item: T["items"][number]; verified: boolean }
  | { kind: "none" };

/**
 * Finds the order a scanned garment belongs to, among orders still inside the
 * warehouse. One garment is one inventory record, so at most one live order can
 * hold it; an order that has already left (or was cancelled) is not offered.
 */
export function findOrderByBarcode<T extends PackStationOrder>(orders: readonly T[], barcode: string): BarcodeMatch<T> {
  const scanned = normalizeBarcode(barcode);
  if (!scanned) return { kind: "none" };
  const live = new Set(["PAID", "PICKING", "READY_TO_PACK", "PACKED"]);
  for (const order of orders) {
    if (order.fulfillment && !live.has(order.fulfillment.status)) continue;
    for (const item of order.items) {
      if (normalizeBarcode(expectedBarcodeFor(order, item)) === scanned) {
        return { kind: "match", order, item, verified: isItemVerified(order, item.id) };
      }
    }
  }
  return { kind: "none" };
}

/**
 * Orders this employee can pick up at the station, for the 等待打包 list.
 *
 * The same ownership the API enforces: an unclaimed order is anyone's; a claimed
 * one belongs to its picker; a parcel ready to pack belongs to its packer. A
 * supervisor (orders.assign-packer) sees every parcel ready to pack or packed,
 * because the API lets them pack any of them.
 */
export function waitingOrders<T extends PackStationOrder>(orders: readonly T[], me: string, supervisor: boolean): T[] {
  const rank: Record<string, number> = { PACKED: 0, READY_TO_PACK: 1, PICKING: 2, PAID: 3 };
  return orders
    .filter((order) => {
      const task = order.fulfillment;
      if (!task) return false;
      if (task.status === "PAID") return !task.assignedPickerEmployeeId || task.assignedPickerEmployeeId === me;
      if (task.status === "PICKING") return task.assignedPickerEmployeeId === me;
      if (task.status === "READY_TO_PACK") return supervisor || task.assignedPackerEmployeeId === me;
      if (task.status === "PACKED") return supervisor || task.assignedPackerEmployeeId === me;
      return false;
    })
    .sort((a, b) => (rank[a.fulfillment!.status] ?? 9) - (rank[b.fulfillment!.status] ?? 9));
}

/**
 * The label printer is found once a day, not once a parcel. Detection asks the
 * local print helper which printers exist; the answer does not change between
 * two parcels, and asking thirty times a morning is thirty chances to fail.
 */
export const PRINTER_MEMORY_KEY = "online-saler.pack-station.printer";

export function printerMemoryValue(printerName: string, today: string): string {
  return JSON.stringify({ printer: printerName, day: today });
}

export function rememberedPrinter(raw: string | null | undefined, today: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { printer?: unknown; day?: unknown };
    if (parsed.day !== today || typeof parsed.printer !== "string" || !parsed.printer.trim()) return null;
    return parsed.printer;
  } catch {
    return null;
  }
}

/** The local calendar day, so "today" turns over at the shop's midnight, not UTC's. */
export function localDay(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
