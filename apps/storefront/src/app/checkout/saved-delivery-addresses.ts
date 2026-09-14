import {
  formatDeliveryAddress,
  parseDeliveryAddress,
  validDeliveryPoint,
  type DeliveryPoint,
} from "@online-saler/business-rules";

export type PlaceType = "house" | "apartment" | "office" | "other";

export type SavedDeliveryAddress = {
  id: string;
  address: string;
  point: DeliveryPoint | null;
  placeType: PlaceType;
  building: string;
  floor: string;
  door: string;
  directions: string;
  label: string;
};

const PLACE_TYPES: PlaceType[] = ["house", "apartment", "office", "other"];
const MAX_ADDRESSES = 20;
const MAX_STORAGE_LENGTH = 100_000;
const TEXT_LIMITS = {
  address: 700,
  building: 120,
  floor: 40,
  door: 40,
  directions: 500,
  label: 80,
} as const;
const FIELD_NAMES = {
  address: "Address",
  building: "Building name",
  floor: "Floor",
  door: "Door or house number",
  directions: "Additional directions",
  label: "Address label",
} as const;
const INVALID_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function emptyDeliveryAddress(): SavedDeliveryAddress {
  return {
    id: "", address: "", point: null, placeType: "house",
    building: "", floor: "", door: "", directions: "", label: "",
  };
}

function singleLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function addressSummary(address: SavedDeliveryAddress): string {
  return [
    singleLine(address.building),
    address.floor.trim() ? `Floor ${singleLine(address.floor)}` : "",
    address.door.trim() ? `Door ${singleLine(address.door)}` : "",
  ].filter(Boolean).join(" · ");
}

/** Keep the map URL last so orders and operations can use the existing parser. */
export function serializeDeliveryAddress(address: SavedDeliveryAddress): string {
  const placeType = address.placeType[0].toUpperCase() + address.placeType.slice(1);
  const lines = [singleLine(address.address), `Place type: ${placeType}`];
  if (address.building.trim()) lines.push(`Building: ${singleLine(address.building)}`);
  if (address.floor.trim()) lines.push(`Floor: ${singleLine(address.floor)}`);
  if (address.door.trim()) lines.push(`Door: ${singleLine(address.door)}`);
  if (address.directions.trim()) lines.push(`Directions: ${singleLine(address.directions)}`);
  return formatDeliveryAddress(lines.join("\n"), address.point);
}

/** Restore both pre-existing free-text drafts and the structured checkout text. */
export function toSavedDeliveryAddress(value: string): SavedDeliveryAddress {
  const parsed = parseDeliveryAddress(value);
  const result = { ...emptyDeliveryAddress(), address: parsed.address.trim(), point: parsed.point };
  const lines = parsed.address.split("\n");
  let typeIndex = -1;
  for (let index = lines.length - 1; index > 0; index -= 1) {
    if (/^Place type: (House|Apartment|Office|Other)$/.test(lines[index])) { typeIndex = index; break; }
  }
  if (typeIndex < 1) return result;

  const fields: Partial<Pick<SavedDeliveryAddress, "building" | "floor" | "door" | "directions">> = {};
  const fieldNames = { Building: "building", Floor: "floor", Door: "door", Directions: "directions" } as const;
  for (const line of lines.slice(typeIndex + 1)) {
    const match = line.match(/^(Building|Floor|Door|Directions): (.*)$/);
    if (!match) return result;
    const key = fieldNames[match[1] as keyof typeof fieldNames];
    if (fields[key] !== undefined) return result;
    fields[key] = match[2];
  }
  return {
    ...result,
    ...fields,
    address: lines.slice(0, typeIndex).join("\n").trim(),
    placeType: lines[typeIndex].slice("Place type: ".length).toLowerCase() as PlaceType,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSavedAddress(address: SavedDeliveryAddress): string | null {
  if (!isRecord(address) || typeof address.id !== "string" || address.id.length > 128
    || INVALID_CONTROL_CHARACTERS.test(address.id)) return "This address could not be read. Please add it again.";
  if (!PLACE_TYPES.includes(address.placeType)) return "Choose a place type.";
  for (const key of Object.keys(TEXT_LIMITS) as Array<keyof typeof TEXT_LIMITS>) {
    const value = address[key];
    if (typeof value !== "string" || INVALID_CONTROL_CHARACTERS.test(value)) {
      return `Enter a valid ${FIELD_NAMES[key].toLowerCase()}.`;
    }
    if (value.length > TEXT_LIMITS[key]) return `${FIELD_NAMES[key]} must be ${TEXT_LIMITS[key]} characters or fewer.`;
  }
  if (!address.address.trim()) return "Enter your street address or a nearby landmark.";
  if (address.point !== null && (!isRecord(address.point)
    || typeof address.point.lat !== "number" || typeof address.point.lng !== "number"
    || !validDeliveryPoint(address.point))) return "Choose a valid location on the map, or enter your address manually.";
  if (address.placeType === "apartment" && !address.floor.trim()) return "Enter your apartment floor (for example, Ground).";
  if (address.placeType === "apartment" && !address.door.trim()) return "Enter your apartment door number.";
  if (address.placeType === "office" && !address.building.trim()) return "Enter your office building name.";
  if (serializeDeliveryAddress(address).length > 1500) return "Your full delivery address is too long. Please shorten the address or directions.";
  return null;
}

function normalizedAddress(address: SavedDeliveryAddress): SavedDeliveryAddress {
  return {
    id: address.id.trim(),
    address: singleLine(address.address),
    point: address.point ? { lat: address.point.lat, lng: address.point.lng } : null,
    placeType: address.placeType,
    building: singleLine(address.building),
    floor: singleLine(address.floor),
    door: singleLine(address.door),
    directions: singleLine(address.directions),
    label: singleLine(address.label),
  };
}

export function parseSavedAddresses(raw: string | null): SavedDeliveryAddress[] {
  if (!raw || raw.length > MAX_STORAGE_LENGTH) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const addresses: SavedDeliveryAddress[] = [];
  const seen = new Set<string>();
  // Bound both parsing work and stored entries, including malformed older data.
  for (const candidate of parsed.slice(0, 100)) {
    if (!isRecord(candidate)) continue;
    const address = candidate as SavedDeliveryAddress;
    if (validateSavedAddress(address) || !address.id.trim()) continue;
    const normalized = normalizedAddress(address);
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    addresses.push(normalized);
    if (addresses.length === MAX_ADDRESSES) break;
  }
  return addresses;
}

export function addressStorageKey(customerId: string): string {
  return `dloop_saved_delivery_addresses:v1:${encodeURIComponent(customerId)}`;
}

export function upsertSavedAddress(list: SavedDeliveryAddress[], address: SavedDeliveryAddress): SavedDeliveryAddress[] {
  const error = validateSavedAddress(address);
  if (error) throw new Error(error);
  const candidate = normalizedAddress(address);
  const current = parseSavedAddresses(JSON.stringify(list));
  // Repeatedly saving the same new address must not create extra entries.
  const matching = candidate.id ? undefined : current.find((item) =>
    item.label === candidate.label && serializeDeliveryAddress(item) === serializeDeliveryAddress(candidate));
  candidate.id = candidate.id || matching?.id || globalThis.crypto?.randomUUID?.()
    || `address-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return [candidate, ...current.filter((item) => item.id !== candidate.id)].slice(0, MAX_ADDRESSES);
}
