/**
 * What a packed parcel still needs before it can leave the warehouse.
 *
 * Two facts gate the ④ 打面单发车 step, in this order:
 *
 * 1. It knows where it is going. A pickup order carries the store the shopper
 *    chose. A delivery order has none until someone picks the store it travels
 *    through (中转点) — and without a destination there is no package code and
 *    so no sticker to print.
 * 2. Its sticker has been printed. The store checks a parcel in by scanning the
 *    QR on it, so a box sent without one arrives as a parcel nobody can receive.
 *    The API refuses 发往门店 until the print is recorded; the screens say so
 *    before anyone presses the button.
 */

type NodeLike = { type: string } | null | undefined;

export type DispatchOrder = {
  fulfillmentMethod: string;
  fulfillmentNode?: NodeLike;
  fulfillment?: {
    status: string;
    fulfillmentNode?: NodeLike;
    packageCode?: string | null;
    packageLabelPrintedAt?: string | null;
  } | null;
};

export function destinationNode(order: DispatchOrder): NodeLike {
  return order.fulfillment?.fulfillmentNode ?? order.fulfillmentNode ?? null;
}

/** A packed parcel with nowhere to go: routing it is the next thing to do. */
export function needsDestination(order: DispatchOrder): boolean {
  return order.fulfillment?.status === "PACKED" && !destinationNode(order);
}

/** A delivery order is routed through a store (中转点); only stores qualify. */
export function isTransitNodeOption(node: { type: string }): boolean {
  return node.type === "STORE";
}

export function labelPrinted(order: DispatchOrder): boolean {
  return Boolean(order.fulfillment?.packageLabelPrintedAt);
}

/** Packed and bound for a store, so the next step is 发往门店. */
export function travelsToStore(order: DispatchOrder): boolean {
  return order.fulfillment?.status === "PACKED" && destinationNode(order)?.type === "STORE";
}

export function canSendToStore(order: DispatchOrder): boolean {
  return travelsToStore(order) && labelPrinted(order);
}

export function canPrintLabel(order: DispatchOrder): boolean {
  return Boolean(order.fulfillment?.packageCode) && Boolean(destinationNode(order));
}

/**
 * Splits a selection for the batch bar: what can be printed, what can be sent,
 * and how many were left out and why — so "发往门店 8 单" out of 12 ticked comes
 * with the four it skipped.
 */
export function planDispatchBatch<T extends DispatchOrder>(orders: T[]) {
  return {
    printable: orders.filter(canPrintLabel),
    sendable: orders.filter(canSendToStore),
    unrouted: orders.filter(needsDestination),
    unprinted: orders.filter((order) => travelsToStore(order) && !labelPrinted(order))
  };
}
