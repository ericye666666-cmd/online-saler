import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legacyWarehouseRedirect, ORDER_STATUS_TABS } from "./order-center-routes";

// The strip shows every tab the API can put an order on, in the API's order.
// A tab missing here is a count in 全部 with no place to click — parcels sent to
// a store (在途) and parcels at the store (已到店) were exactly that.
const apiState = readFileSync(
  new URL("../../../../api/src/operations/operations-fulfillment-state.ts", import.meta.url),
  "utf8"
);
const apiTabs = [...(apiState.match(/ORDER_CENTER_TABS = \[([\s\S]*?)\] as const/)?.[1] ?? "").matchAll(/"([a-z-]+)"/g)]
  .map((match) => match[1]);
assert.ok(apiTabs.length > 10, "could not read ORDER_CENTER_TABS from the API");
assert.deepEqual(ORDER_STATUS_TABS.map(([value]) => value), apiTabs);
assert.equal(ORDER_STATUS_TABS.length, 17);
const position = (value: string) => ORDER_STATUS_TABS.findIndex(([tab]) => tab === value);
assert.ok(position("packed") < position("in-transit-to-node"));
assert.ok(position("in-transit-to-node") < position("at-node"));
assert.ok(position("at-node") < position("ready-for-pickup"));
assert.equal(legacyWarehouseRedirect("/warehouse"), "/orders");
assert.equal(legacyWarehouseRedirect("/warehouse/picking"), "/orders/all?status=waiting-pick");
assert.equal(legacyWarehouseRedirect("/warehouse/packing"), "/orders/all?status=ready-to-pack");
assert.equal(legacyWarehouseRedirect("/warehouse/delivery"), "/orders/all?status=ready-for-dispatch");
assert.equal(legacyWarehouseRedirect("/warehouse/exceptions"), "/orders/exceptions");
assert.equal(legacyWarehouseRedirect("/warehouse/inventory"), "/system/warehouse/locations");

const orderClient = readFileSync(new URL("./orders-client.tsx", import.meta.url), "utf8");
assert.match(orderClient, /order\.items\.map/);
assert.match(orderClient, /inventoryItem\?\.location\?\.locationCode/);
assert.match(orderClient, /displayImageUrl/);
// The picker needs to see the garment, so the card renders its photo. The
// element is asserted rather than its size class, which is styling and may
// change without the card losing its picture.
assert.match(orderClient, /<OrderItemImage/);
assert.match(orderClient, /预期 Barcode/);
assert.match(orderClient, /错误|失败|does not match|Barcode/);
assert.match(orderClient, /Authorization/);
assert.doesNotMatch(orderClient, /JSON\.stringify\(\{ adminUserId/);

const shell = readFileSync(new URL("../../components/admin/operations-admin-shell.tsx", import.meta.url), "utf8");
// The eight ends of the business. Each is a job somebody holds, and a role can
// be given one of them and nothing else.
assert.deepEqual(
  ["商品中心", "仓库发货", "门店端", "骑手端", "推广中心", "客服端", "数据中心", "系统管理"]
    .every((label) => shell.includes(`label: "${label}"`)),
  true
);
assert.doesNotMatch(shell, /label: "仓库履约"/);
// Pressing an end has to go somewhere. While this was state rather than a route,
// the menu changed and the page did not.
assert.match(shell, /router\.push\(home\)/);

console.log("Order-center route migration tests passed");
