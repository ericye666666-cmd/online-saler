import assert from "node:assert/strict";
import {
  calculateCommissionKsh,
  canPayCommission,
  landingPathForProduct,
  normalizeAffiliateCode,
  normalizeCampaignValue,
  normalizeSourceValue,
  parseAffiliateCookie,
  encodeAffiliateCookie
} from "./affiliate-service";
import { createPendingCommissionForPaidOrder } from "./affiliate-service";

async function verifyLaunchCommission() {
  let existing: { rateBps: number; commissionAmountKsh: number } | null = null;
  let creates = 0;
  const tx = {
    order: { findUnique: async () => ({ id: "paid", status: "PAID", affiliateId: "seller", affiliate: { commissionRateBps: 3000 }, itemSubtotalKsh: 300, totalKsh: 350, commission: existing }) },
    systemSetting: { findUnique: async () => ({ valueJson: 2500 }) },
    commission: { create: async ({ data }: { data: { rateBps: number; commissionAmountKsh: number } }) => { creates++; return data; } }
  } as unknown as Parameters<typeof createPendingCommissionForPaidOrder>[0];
  const commission = await createPendingCommissionForPaidOrder(tx, "paid");
  assert.equal(commission?.rateBps, 2500, "legacy 30% override must not override the launch rate");
  assert.equal(commission?.commissionAmountKsh, 75, "only item subtotal is commissionable");
  existing = { rateBps: 3000, commissionAmountKsh: 90 };
  assert.equal(await createPendingCommissionForPaidOrder(tx, "paid"), existing, "payment retries preserve historical commissions");
  assert.equal(creates, 1);
}
verifyLaunchCommission().catch((error) => { console.error(error); process.exitCode = 1; });

assert.equal(normalizeAffiliateCode(" dl-aff 001 "), "DL-AFF001");
assert.equal(normalizeAffiliateCode("dl_aff-001"), "DL_AFF-001");
assert.equal(normalizeAffiliateCode(""), null);

assert.equal(normalizeSourceValue("TikTok Ads!"), "tiktokads");
assert.equal(normalizeCampaignValue("launch:week-1"), "launch:week-1");

assert.equal(landingPathForProduct("ABC123"), "/p/ABC123");
assert.equal(landingPathForProduct(null), "/");

assert.equal(calculateCommissionKsh(1000, 1000), 100);
assert.equal(calculateCommissionKsh(650, 750), 49);
assert.equal(calculateCommissionKsh(650, -1), 0);

assert.equal(canPayCommission({ status: "CONFIRMED", holdReason: null }), true);
assert.equal(canPayCommission({ status: "CONFIRMED", holdReason: "ORDER_REFUNDED" }), false);
assert.equal(canPayCommission({ status: "PENDING", holdReason: null }), false);

const encoded = encodeAffiliateCookie({
  affiliateCode: "DL-AFF-001",
  clickId: "click-1",
  source: "whatsapp",
  placement: "direct-message",
  campaign: "staging",
  expiresAt: new Date(Date.now() + 60_000).toISOString()
});
assert.deepEqual(parseAffiliateCookie(encoded)?.affiliateCode, "DL-AFF-001");
assert.equal(parseAffiliateCookie(encoded)?.placement, "direct-message");
assert.equal(parseAffiliateCookie("not-a-cookie"), null);

console.log("Affiliate service tests passed");
