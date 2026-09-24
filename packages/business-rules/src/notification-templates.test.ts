import assert from "node:assert/strict";
import test from "node:test";
import { notificationBody } from "./notification-templates";
import { SUPPORT_PHONE_LABEL } from "./notification-topics";

/**
 * What this shop told Safaricom it would send.
 *
 * The DIRECTLOOP sender id was moved from Promotional to Transactional on
 * 2026-09-24 against four declared message formats, and the undertaking carries
 * a KES 25,000 fine if the id is later found carrying promotional traffic. The
 * declaration is a page of paper in a filing cabinet; this is the copy of it
 * that fails a build.
 *
 * A change here is not a copy tweak. It is a change to what was filed, and the
 * letter has to be refiled with it.
 */

const SUPPORT = SUPPORT_PHONE_LABEL;

test("payment confirmation matches the filed sample", () => {
  assert.equal(
    notificationBody("CUSTOMER_PAYMENT_SUCCESS", {
      orderNumber: "DL-10281",
      amountKsh: 1450,
      itemCount: 2,
      supportPhone: SUPPORT
    }),
    `Direct Loop: payment received for order DL-10281 (KSh 1,450). We are preparing 2 items now. Questions? ${SUPPORT}`
  );
});

test("delivery verification code matches the filed sample", () => {
  assert.equal(
    notificationBody("CUSTOMER_DELIVERY_CODE", {
      orderNumber: "DL-10281",
      riderName: "Peter",
      deliveryCode: "5832",
      supportPhone: SUPPORT
    }),
    `Direct Loop: order DL-10281 is out for delivery with Peter. Delivery code 5832. Give this code to the rider only after you have received your order. ${SUPPORT}`
  );
});

test("pickup verification code matches the filed sample", () => {
  assert.equal(
    notificationBody("CUSTOMER_ORDER_READY_FOR_PICKUP", {
      orderNumber: "DL-10281",
      nodeName: "Kinoo",
      pickupCode: "4417",
      supportPhone: SUPPORT
    }),
    `Direct Loop: order DL-10281 is ready for pickup at Kinoo. Pickup code 4417. ${SUPPORT}`
  );
});

test("failed delivery notice matches the filed sample", () => {
  assert.equal(
    notificationBody("CUSTOMER_DELIVERY_FAILED", {
      orderNumber: "DL-10281",
      reason: "nobody answered",
      supportPhone: SUPPORT
    }),
    `Direct Loop: we could not deliver order DL-10281 today (nobody answered). Your payment is safe and we will try again. ${SUPPORT}`
  );
});

/**
 * A link is the clearest thing a bulk-SMS filter reads as marketing, and none of
 * the four filed samples has one. The pickup message carried a Google Maps
 * shortlink until 2026-09-24 — which also made it 157 characters, two segments
 * and twice the price. The map belongs on the shopper's order page, where it can
 * be tapped instead of retyped.
 */
const CUSTOMER_TOPICS = [
  "CUSTOMER_PAYMENT_SUCCESS",
  "CUSTOMER_DEPOSIT_RECEIVED",
  "CUSTOMER_DEPOSIT_BALANCE_DUE",
  "CUSTOMER_DEPOSIT_EXPIRED",
  "CUSTOMER_ORDER_READY_FOR_PICKUP",
  "CUSTOMER_ORDER_DISPATCHED",
  "CUSTOMER_DELIVERY_CODE",
  "CUSTOMER_DELIVERY_FAILED",
  "CUSTOMER_ORDER_COMPLETED",
  "CUSTOMER_REFUND_RECORDED"
] as const;

/** A real order number, not the short one the filed samples used. */
function sample(topic: (typeof CUSTOMER_TOPICS)[number]): string {
  return notificationBody(topic, {
    orderNumber: "DL-20260924-1A2B3C4D",
    nodeName: "Lucky Summer",
    riderName: "Peter",
    deliveryCode: "5832",
    pickupCode: "4417",
    amountKsh: 1450,
    balanceKsh: 725,
    itemCount: 2,
    daysLeft: 3,
    dueDateLabel: "Mon 30 Sep",
    reason: "nobody answered",
    supportPhone: SUPPORT
  });
}

test("no customer message carries a link", () => {
  for (const topic of CUSTOMER_TOPICS) {
    assert.doesNotMatch(sample(topic), /https?:\/\//, `${topic} carries a link, which reads as marketing`);
  }
});

/**
 * 153 characters is one concatenated GSM-7 segment.
 *
 * Messages that go out on every order pay the second segment on every order, so
 * they are held to one. Two of them cannot be: the delivery code is a filed
 * format and changing it means refiling the letter, and the lapsed-deposit
 * notice has to say three things — the balance went unpaid, the garment is back
 * on sale, and only part of the money is coming back. Dropping the third is how
 * a shopper who reads "refund" and expects all of it ends up phoning support.
 *
 * Both are capped at two segments so neither can quietly become three.
 */
const TWO_SEGMENTS_ALLOWED = new Set(["CUSTOMER_DELIVERY_CODE", "CUSTOMER_DEPOSIT_EXPIRED"]);

test("every-order messages fit one segment, and nothing exceeds two", () => {
  for (const topic of CUSTOMER_TOPICS) {
    const body = sample(topic);
    const limit = TWO_SEGMENTS_ALLOWED.has(topic) ? 306 : 153;
    assert.ok(
      body.length <= limit,
      `${topic} runs to ${body.length} characters, over its ${limit}-character budget`
    );
  }
});
