/**
 * Which of the store console's three tiles a parcel belongs under.
 *
 * Pickup and delivery parcels are sorted by fulfillment status only: a
 * delivery parcel the warehouse routed through this store is on the way here
 * exactly like a pickup, and once signed for it waits under 发货 for a rider,
 * as a pickup waits there for its customer.
 */
type ParcelLike = { fulfillmentMethod: string; fulfillment?: { status: string } | null };

const HAND_OVER = ["ARRIVED_AT_NODE", "READY_FOR_PICKUP", "READY_FOR_DISPATCH", "OUT_FOR_DELIVERY"];
const NOTIFY = ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"];

export function storeParcelsByTile<T extends ParcelLike>(orders: T[]) {
  const status = (order: T) => order.fulfillment?.status ?? "";
  return {
    inTransit: orders.filter((order) => status(order) === "IN_TRANSIT_TO_NODE"),
    toHandOver: orders.filter((order) => HAND_OVER.includes(status(order))),
    toNotify: orders.filter((order) => NOTIFY.includes(status(order)))
  };
}

/**
 * An outside (Bolt) rider needs a name and a reachable phone. The API refuses
 * a missing phone; the button used to light up with a name alone and then fail.
 */
export function boltRiderReady(name: string, phone: string): boolean {
  return name.trim().length > 0 && phone.replace(/\D/g, "").length >= 9;
}
