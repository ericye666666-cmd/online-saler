/**
 * Pickup points are fulfillment nodes in the database now, so stores can be
 * added, renamed or closed without a deploy. This module keeps only the shape
 * the checkout UI renders and the helper that formats a chosen point.
 */
export type PickupPoint = {
  id: string;
  code: string;
  name: string;
  mapsUrl: string | null;
  address: string | null;
};

export function pickupPointLabel(point: PickupPoint): string {
  return [point.name, point.address].filter(Boolean).join(" - ");
}
