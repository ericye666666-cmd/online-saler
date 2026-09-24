import assert from "node:assert/strict";
import { CommissionStatus } from "@online-saler/database";
import { dictionary } from "../i18n/dictionary";
import { sellerHeaderAction, sellerRewardStatus } from "./seller-dashboard-service";

// Keys, not words: the label is chosen here and translated where it renders, so
// a shopper reading English never sees a Chinese header and vice versa.
assert.deepEqual(sellerHeaderAction(false), {
  labelKey: "seller.headerJoin",
  href: "/join-seller",
  active: false
});

assert.deepEqual(sellerHeaderAction(true), {
  labelKey: "seller.headerDashboard",
  href: "/seller",
  active: true
});

for (const key of ["seller.headerJoin", "seller.headerDashboard"] as const) {
  assert.ok(dictionary.en[key as keyof typeof dictionary.en], `${key} has no English copy`);
  assert.ok(dictionary["zh-CN"][key as keyof typeof dictionary.en], `${key} has no Chinese copy`);
}

assert.equal(sellerRewardStatus(CommissionStatus.PENDING), "Pending");
assert.equal(sellerRewardStatus(CommissionStatus.CONFIRMED), "Available");
assert.equal(sellerRewardStatus(CommissionStatus.PAID), "Paid");
assert.equal(sellerRewardStatus(CommissionStatus.REJECTED), "Rejected");

console.log("seller dashboard service tests passed");
