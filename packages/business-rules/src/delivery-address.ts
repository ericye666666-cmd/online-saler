export type DeliveryPoint = { lat: number; lng: number };

export function validDeliveryPoint(point: DeliveryPoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

export function deliveryMapUrl(point: DeliveryPoint): string {
  if (!validDeliveryPoint(point)) throw new Error("Invalid delivery location");
  return `https://www.google.com/maps/search/?api=1&query=${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

export function formatDeliveryAddress(address: string, point: DeliveryPoint | null): string {
  const label = address.trim();
  return point ? `${label || "Pinned delivery location"}\nGoogle Maps: ${deliveryMapUrl(point)}` : label;
}

export function parseDeliveryAddress(value: string): { address: string; point: DeliveryPoint | null } {
  const match = value.match(/\nGoogle Maps: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!match) return { address: value, point: null };
  const point = { lat: Number(match[1]), lng: Number(match[2]) };
  return validDeliveryPoint(point) ? { address: value.slice(0, match.index), point } : { address: value, point: null };
}
