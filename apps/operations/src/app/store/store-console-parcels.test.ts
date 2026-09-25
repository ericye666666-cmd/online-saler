import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { boltRiderReady, storeParcelsByTile } from "./store-console-parcels";

const pickupOnTheWay = { id: "p1", fulfillmentMethod: "PICKUP", fulfillment: { status: "IN_TRANSIT_TO_NODE" } };
const deliveryOnTheWay = { id: "d1", fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY", fulfillment: { status: "IN_TRANSIT_TO_NODE" } };
const deliveryArrived = { id: "d2", fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY", fulfillment: { status: "ARRIVED_AT_NODE" } };
const pickupReady = { id: "p2", fulfillmentMethod: "PICKUP", fulfillment: { status: "READY_FOR_PICKUP" } };
const deliveryOut = { id: "d3", fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY", fulfillment: { status: "OUT_FOR_DELIVERY" } };

const tiles = storeParcelsByTile([pickupOnTheWay, deliveryOnTheWay, deliveryArrived, pickupReady, deliveryOut]);

// A delivery parcel routed through the store is on the way here just like a pickup.
assert.deepEqual(tiles.inTransit.map((order) => order.id), ["p1", "d1"]);
// Signed for, it waits under 发货 for a rider; a pickup waits there for its customer.
assert.deepEqual(tiles.toHandOver.map((order) => order.id), ["d2", "p2", "d3"]);
assert.deepEqual(tiles.toNotify.map((order) => order.id), ["p2", "d3"]);

// A Bolt rider needs both a name and a phone the API will accept.
assert.equal(boltRiderReady("Peter", ""), false);
assert.equal(boltRiderReady("", "0712345678"), false);
assert.equal(boltRiderReady("Peter", "0712"), false);
assert.equal(boltRiderReady("Peter", "0712 345 678"), true);

// The console asks only for the parcels a store works, and hands to its own
// riders through the same endpoint as the desktop desk.
const consoleSource = readFileSync(new URL("./store-console.tsx", import.meta.url), "utf8");
assert.match(consoleSource, /scope: "node"/);
assert.doesNotMatch(consoleSource, /scope: "all"/);
assert.match(consoleSource, /"dispatch-to-rider"/);
assert.match(consoleSource, /\/operations\/riders/);

const deskSource = readFileSync(new URL("../orders/node/node-client.tsx", import.meta.url), "utf8");
assert.match(deskSource, /scope: "node"/);

console.log("store console parcels ok");
