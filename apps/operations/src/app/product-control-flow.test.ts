import assert from "node:assert/strict";
import {
  canAssignProductLocation,
  canConfirmProductPlaced,
  canPrintProductLabel,
  productControlImageUrl,
  productControlLocationCode
} from "./product-control-flow";

const readyProduct = {
  barcode: "DLFTEST100",
  status: "READY_FOR_STORAGE",
  images: [{ publicUrl: "/products/abc/images/front" }],
  inventoryItem: {
    id: "item-1",
    locationId: "loc-1",
    status: "PENDING_STOCK_IN",
    location: { locationCode: "A-010203" }
  }
};

assert.equal(productControlImageUrl(readyProduct, "/api-proxy"), "/api-proxy/products/abc/images/front");
assert.equal(productControlLocationCode(readyProduct), "A-010203");
assert.equal(canPrintProductLabel(readyProduct), true);
assert.equal(canAssignProductLocation(readyProduct), true);
assert.equal(canConfirmProductPlaced(readyProduct), true);

assert.equal(canPrintProductLabel({ title: "No barcode" }), false);
assert.equal(canAssignProductLocation({ status: "BARCODE_ASSIGNED", barcode: "DLFTEST101" }), false);
assert.equal(canConfirmProductPlaced({ barcode: "DLFTEST101" }), false);
assert.equal(
  canConfirmProductPlaced({
    inventoryItem: {
      id: "item-2",
      locationId: "loc-2",
      status: "AVAILABLE",
      location: { locationCode: "A-010204" }
    }
  }),
  false
);

console.log("Product control flow tests passed");
