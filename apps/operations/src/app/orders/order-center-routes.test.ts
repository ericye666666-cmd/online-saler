import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legacyWarehouseRedirect, ORDER_STATUS_TABS } from "./order-center-routes";

assert.equal(ORDER_STATUS_TABS.length, 12);
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
assert.match(orderClient, /operationsImageUrl/);
assert.match(orderClient, /API_PROXY_URL/);
assert.match(orderClient, /sm:grid-cols-\[176px_1fr_auto\]/);
assert.match(orderClient, /aspect-\[4\/5\].*max-w-44/);
assert.match(orderClient, /预期 Barcode/);
assert.match(orderClient, /错误|失败|does not match|Barcode/);
assert.match(orderClient, /Authorization/);
assert.doesNotMatch(orderClient, /JSON\.stringify\(\{ adminUserId/);

const shell = readFileSync(new URL("../../components/admin/operations-admin-shell.tsx", import.meta.url), "utf8");
assert.deepEqual(
  ["商品中心", "订单中心", "推广中心", "客服中心", "数据中心", "系统管理"].every((label) => shell.includes(`label: "${label}"`)),
  true
);
assert.doesNotMatch(shell, /label: "仓库履约"/);

console.log("Order-center route migration tests passed");
