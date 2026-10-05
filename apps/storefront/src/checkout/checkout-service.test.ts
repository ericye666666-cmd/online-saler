import assert from "node:assert/strict";
import {
  CHECKOUT_PREVIOUS_PAYMENT_IN_FLIGHT_MESSAGE,
  CHECKOUT_TOO_MANY_PIECES_MESSAGE,
  earlierAttemptMayStillBePaid,
  normalizeKenyaPhone,
  reservationAllowanceError
} from "./checkout-service";
import { PaymentStatus, normalizeNotificationPhone } from "@online-saler/database";
import { MAX_ACTIVE_RESERVATIONS_PER_PHONE, MAX_DEPOSIT_HOLDS_PER_PHONE, KIKUYU_DELIVERY_FEE_KSH, getDeliveryFeeKsh, calculateOrderAmounts, formatDeliveryAddress, parseDeliveryAddress, deliveryMapUrl } from "@online-saler/business-rules";

// Pickup is free; Nairobi delivery charges the shopper a flat KSh 200 that the
// node's actual Bolt fare is later measured against.
assert.equal(getDeliveryFeeKsh("PICKUP"), 0);
assert.equal(getDeliveryFeeKsh("KIKUYU_LOCAL_DELIVERY"), KIKUYU_DELIVERY_FEE_KSH);
assert.equal(KIKUYU_DELIVERY_FEE_KSH, 200);
assert.equal(calculateOrderAmounts([{ productId: "unique-shirt", unitPriceKsh: 300 }], getDeliveryFeeKsh("PICKUP")).totalKsh, 300);
assert.equal(calculateOrderAmounts([{ productId: "unique-shirt", unitPriceKsh: 300 }], getDeliveryFeeKsh("KIKUYU_LOCAL_DELIVERY")).totalKsh, 500);
const pin = { lat: -1.246, lng: 36.663 };
const address = formatDeliveryAddress("Kikuyu test landmark", pin);
assert.deepEqual(parseDeliveryAddress(address), { address: "Kikuyu test landmark", point: pin });
assert.equal(parseDeliveryAddress("manual address").point, null);
assert.equal(parseDeliveryAddress("address\nGoogle Maps: javascript:alert(1)").point, null);
assert.throws(() => deliveryMapUrl({ lat: 91, lng: 36 }), /Invalid/);
assert.throws(() => deliveryMapUrl({ lat: 0, lng: Number.NaN }), /Invalid/);

assert.equal(normalizeKenyaPhone("0712 345 678"), "254712345678");
assert.equal(normalizeKenyaPhone("712345678"), "254712345678");
assert.equal(normalizeKenyaPhone("+254 712 345 678"), "254712345678");
assert.equal(normalizeKenyaPhone("0112-345-678"), "254112345678");
assert.throws(() => normalizeKenyaPhone("0201234567"), /valid Kenyan/);
assert.throws(() => normalizeKenyaPhone("07123"), /valid Kenyan/);

// Checkout no longer sends a WhatsApp number. The server stores null for it,
// and every notification and staff screen falls back to the M-Pesa phone.
assert.equal(normalizeNotificationPhone(undefined), null);
assert.equal(normalizeNotificationPhone(null), null);
assert.equal(normalizeNotificationPhone(""), null);

// One phone may pay for 50 pieces at once (owner, 2026-10-05; was 5).
assert.equal(MAX_ACTIVE_RESERVATIONS_PER_PHONE, 50);
assert.equal(reservationAllowanceError({ requestedPieces: 50, piecesInEarlierPayments: 0 }), null);
assert.equal(reservationAllowanceError({ requestedPieces: 51, piecesInEarlierPayments: 0 }), CHECKOUT_TOO_MANY_PIECES_MESSAGE);
assert.equal(CHECKOUT_TOO_MANY_PIECES_MESSAGE, "You can pay for up to 50 pieces at once.");
// Whatever still counts after earlier unpaid attempts were released belongs
// to a payment that may still land, and the message says so.
assert.equal(reservationAllowanceError({ requestedPieces: 49, piecesInEarlierPayments: 1 }), null);
assert.equal(reservationAllowanceError({ requestedPieces: 50, piecesInEarlierPayments: 1 }), CHECKOUT_PREVIOUS_PAYMENT_IN_FLIGHT_MESSAGE);
assert.equal(reservationAllowanceError({ requestedPieces: 51, piecesInEarlierPayments: 3 }), CHECKOUT_TOO_MANY_PIECES_MESSAGE);
assert.doesNotMatch(CHECKOUT_PREVIOUS_PAYMENT_IN_FLIGHT_MESSAGE, /five/);

// Which earlier attempts a new checkout may release. No PENDING row means no
// STK prompt was ever sent, so nothing can land on it; a failed, cancelled or
// timed-out prompt is finished. A prompt still out, or one whose outcome is
// unknown, could still take the shopper's money, so it is kept.
assert.equal(earlierAttemptMayStillBePaid([]), false);
assert.equal(earlierAttemptMayStillBePaid([{ status: PaymentStatus.FAILED }]), false);
assert.equal(earlierAttemptMayStillBePaid([{ status: PaymentStatus.CANCELLED }, { status: PaymentStatus.TIMEOUT }]), false);
assert.equal(earlierAttemptMayStillBePaid([{ status: PaymentStatus.EXPIRED }]), false);
assert.equal(earlierAttemptMayStillBePaid([{ status: PaymentStatus.PENDING }]), true);
assert.equal(earlierAttemptMayStillBePaid([{ status: PaymentStatus.FAILED }, { status: PaymentStatus.MANUAL_REVIEW }]), true);
assert.equal(earlierAttemptMayStillBePaid([{ status: PaymentStatus.SUCCESS }]), true);

// The deposit allowance is its own, unchanged rule.
assert.equal(MAX_DEPOSIT_HOLDS_PER_PHONE, 3);

console.log("Checkout service tests passed");
