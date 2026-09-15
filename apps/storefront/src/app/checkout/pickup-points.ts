export type PickupPoint = { id: string; name: string; mapsUrl: string };

// Five stores and one warehouse. Unconfigured locations stay hidden at checkout.
export const pickupPointSlots: readonly (PickupPoint | null)[] = [
  { id: "thogoto", name: "Thogoto", mapsUrl: "https://maps.app.goo.gl/6xrUnjQAZYzizHUZ7" },
  { id: "kinoo", name: "Kinoo", mapsUrl: "https://maps.app.goo.gl/7vaRmyQjfyw4C5Pi7?g_st=ac" },
  null,
  null,
  null,
  null,
];

export const pickupPoints = pickupPointSlots.filter((point): point is PickupPoint => point !== null);

export function pickupOrderNote(pointId: string, note: string): string {
  const point = pickupPoints.find((candidate) => candidate.id === pointId);
  if (!point) throw new Error("Choose a pickup point before continuing to payment.");
  return [`Pickup point: ${point.name}`, point.mapsUrl, note.trim()].filter(Boolean).join("\n");
}
