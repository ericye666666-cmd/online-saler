import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDeliveryAddress, parseDeliveryAddress } from "@online-saler/business-rules";
import {
  addressStorageKey,
  addressSummary,
  emptyDeliveryAddress,
  parseSavedAddresses,
  serializeDeliveryAddress,
  toSavedDeliveryAddress,
  upsertSavedAddress,
  validateSavedAddress,
  type SavedDeliveryAddress,
} from "./saved-delivery-addresses";

function example(overrides: Partial<SavedDeliveryAddress> = {}): SavedDeliveryAddress {
  return {
    ...emptyDeliveryAddress(),
    id: "saved-home", address: "Kikuyu Road, Kikuyu", placeType: "apartment",
    building: "Green Court", floor: "Ground", door: "C07",
    directions: "Use the blue gate; call when outside.", label: "Home",
    point: { lat: -1.246, lng: 36.663 },
    ...overrides,
  };
}

test("structured delivery details reach the existing order parser with the map URL last", () => {
  const source = example();
  const payload = serializeDeliveryAddress(source);
  const parsed = parseDeliveryAddress(payload);
  assert.deepEqual(parsed.point, source.point);
  assert.equal(parsed.address, [
    "Kikuyu Road, Kikuyu", "Place type: Apartment", "Building: Green Court",
    "Floor: Ground", "Door: C07", "Directions: Use the blue gate; call when outside.",
  ].join("\n"));
  assert.match(payload, /Google Maps: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=-1\.246000,36\.663000$/);
  assert.deepEqual(toSavedDeliveryAddress(payload), { ...source, id: "", label: "" });
  assert.equal(addressSummary(source), "Green Court · Floor Ground · Door C07");
});

test("legacy typed and pinned drafts remain editable without requiring a map", () => {
  const typed = toSavedDeliveryAddress("Near Kikuyu market, opposite the blue gate");
  assert.equal(typed.address, "Near Kikuyu market, opposite the blue gate");
  assert.equal(typed.placeType, "house");
  assert.equal(typed.point, null);
  assert.equal(validateSavedAddress(typed), null);
  const pinned = toSavedDeliveryAddress(formatDeliveryAddress("Old estate, house 7", example().point));
  assert.equal(pinned.address, "Old estate, house 7");
  assert.deepEqual(pinned.point, example().point);
  const freeText = "Main road\nPlace type: Office\nAsk for reception on arrival";
  assert.equal(toSavedDeliveryAddress(freeText).address, freeText);
  assert.equal(validateSavedAddress(example({ placeType: "other", building: "", floor: "", door: "", point: null })), null);
});

test("editing preserves the saved ID, removes duplicate IDs, and does not mutate the original", () => {
  const original = example();
  const other = example({ id: "work", label: "Work" });
  const list = [original, other, original];
  const edited = upsertSavedAddress(list, { ...original, door: "C08" });
  assert.equal(edited.length, 2);
  assert.equal(edited[0].id, original.id);
  assert.equal(edited[0].door, "C08");
  assert.equal(original.door, "C07");
  assert.equal(list.length, 3);
  const created = upsertSavedAddress([], example({ id: "" }));
  assert.ok(created[0].id);
  const savedAgain = upsertSavedAddress(created, example({ id: "" }));
  assert.equal(savedAgain.length, 1);
  assert.equal(savedAgain[0].id, created[0].id);
});

test("stored addresses reject malformed and oversized data and recover valid entries", () => {
  for (const raw of [null, "", "{broken", "null", "{}", "123", '"text"', " ".repeat(100_001)]) {
    assert.deepEqual(parseSavedAddresses(raw), []);
  }
  const valid = example();
  const recovered = parseSavedAddresses(JSON.stringify([
    null, [], 3, {}, { ...valid, id: "" }, { ...valid, id: "wrong-type", door: 7 },
    { ...valid, id: "bad-place", placeType: "warehouse" },
    { ...valid, id: "missing-field", label: undefined },
    { ...valid, id: "bad-point", point: { lat: "-1.246", lng: 36.663 } },
    { ...valid, id: "range", point: { lat: 91, lng: 0 } },
    { ...valid, id: "null-coordinates", point: { lat: null, lng: null } },
    { ...valid, id: "array-point", point: [] },
    valid, { ...valid, door: "Duplicate" },
  ]));
  assert.deepEqual(recovered, [valid]);
  assert.deepEqual(parseSavedAddresses(JSON.stringify(recovered)), recovered);
  const normalized = parseSavedAddresses(JSON.stringify([{ ...valid, id: " saved-home ", unknown: "discard" }]));
  assert.equal(normalized[0].id, "saved-home");
  assert.equal("unknown" in normalized[0], false);
});

test("location validation rejects non-finite and out-of-range values before saving", () => {
  for (const point of [
    { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }, { lat: -Infinity, lng: 0 },
    { lat: 90.001, lng: 0 }, { lat: -90.001, lng: 0 },
    { lat: 0, lng: 180.001 }, { lat: 0, lng: -180.001 },
  ]) {
    assert.match(validateSavedAddress(example({ point })) ?? "", /valid location/);
    assert.throws(() => upsertSavedAddress([], example({ point })), /valid location/);
  }
  assert.equal(validateSavedAddress(example({ point: { lat: 0, lng: 0 } })), null);
  assert.equal(validateSavedAddress(example({ point: { lat: -90, lng: 180 } })), null);
});

test("address requirements depend on place type and accept real floor and door labels", () => {
  assert.match(validateSavedAddress(emptyDeliveryAddress()) ?? "", /street address/);
  assert.match(validateSavedAddress(example({ address: "  " })) ?? "", /street address/);
  assert.match(validateSavedAddress(example({ floor: " " })) ?? "", /floor/);
  assert.match(validateSavedAddress(example({ door: " " })) ?? "", /door/);
  assert.equal(validateSavedAddress(example({ floor: "Ground", door: "C07" })), null);
  assert.match(validateSavedAddress(example({ placeType: "office", building: "" })) ?? "", /building/);
  assert.equal(validateSavedAddress(example({ placeType: "office", floor: "", door: "" })), null);
  assert.equal(validateSavedAddress(example({ placeType: "house", building: "", floor: "", door: "", point: null })), null);
  assert.match(validateSavedAddress(example({ label: "x".repeat(81) })) ?? "", /80 characters/);
  assert.equal(validateSavedAddress(example({ label: "x".repeat(80) })), null);
  assert.match(validateSavedAddress(example({ address: "x".repeat(701) })) ?? "", /700 characters/);
  assert.match(validateSavedAddress(example({ building: "x".repeat(121) })) ?? "", /120 characters/);
  assert.match(validateSavedAddress(example({ floor: "x".repeat(41) })) ?? "", /40 characters/);
  assert.match(validateSavedAddress(example({ door: "x".repeat(41) })) ?? "", /40 characters/);
  assert.match(validateSavedAddress(example({ directions: "x".repeat(501) })) ?? "", /500 characters/);
  assert.match(validateSavedAddress(example({ directions: "Gate\u0000code" })) ?? "", /valid additional directions/);
  const full = example({
    address: "a".repeat(700), building: "b".repeat(120), floor: "f".repeat(40),
    door: "d".repeat(40), directions: "r".repeat(500),
  });
  assert.ok(serializeDeliveryAddress(full).length > 1500);
  assert.match(validateSavedAddress(full) ?? "", /full delivery address is too long/);
});

test("storage is account scoped and both loading and saving cap the list at 20", () => {
  assert.notEqual(addressStorageKey("customer-a"), addressStorageKey("customer-b"));
  assert.notEqual(addressStorageKey("a:b"), addressStorageKey("a%3Ab"));
  assert.match(addressStorageKey("customer-a"), /:v1:customer-a$/);
  const list = Array.from({ length: 30 }, (_, i) => example({ id: `address-${i}` }));
  assert.equal(parseSavedAddresses(JSON.stringify(list)).length, 20);
  const saved = upsertSavedAddress(list, example({ id: "newest" }));
  assert.equal(saved.length, 20);
  assert.equal(saved[0].id, "newest");
  assert.equal(new Set(saved.map((item) => item.id)).size, 20);
});
