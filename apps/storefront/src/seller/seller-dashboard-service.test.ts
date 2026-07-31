import assert from "node:assert/strict";
import { CommissionStatus } from "@online-saler/database";
import { sellerHeaderAction, sellerRewardStatus } from "./seller-dashboard-service";

assert.deepEqual(sellerHeaderAction(false), {
  label: "Join seller",
  href: "/join-seller",
  active: false
});

assert.deepEqual(sellerHeaderAction(true), {
  label: "推广者中台",
  href: "/seller",
  active: true
});

assert.equal(sellerRewardStatus(CommissionStatus.PENDING), "Pending");
assert.equal(sellerRewardStatus(CommissionStatus.CONFIRMED), "Available");
assert.equal(sellerRewardStatus(CommissionStatus.PAID), "Paid");
assert.equal(sellerRewardStatus(CommissionStatus.REJECTED), "Rejected");

console.log("seller dashboard service tests passed");
