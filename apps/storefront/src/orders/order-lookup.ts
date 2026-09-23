import { createHash } from "node:crypto";
import { prisma } from "@online-saler/database";
import { normalizeKenyaPhone } from "../checkout/checkout-service";

/**
 * Recovering an order with a phone number and an order number.
 *
 * Needed because of the deposit plan: a hold has a deadline, and a shopper who
 * cleared their browser or moved to another handset would otherwise have no way
 * to pay the balance before it ran out.
 *
 * The order number is the secret here — `DL-<date>-<8 hex>`, thirty-two bits of
 * randomness — and the phone number proves the caller is the person it was
 * issued to. Both must match. Nothing in the response ever distinguishes "wrong
 * phone" from "wrong order number" from "no such order", because each of those
 * is a fact about someone else's order.
 */

export class OrderLookupError extends Error {}
export class OrderLookupThrottledError extends Error {}

/** Failed tries allowed per phone before that phone is paused. */
const MAX_ATTEMPTS_PER_PHONE = 5;
/** Tries allowed from one caller across every phone, successful or not. */
const MAX_ATTEMPTS_PER_CALLER = 20;
const WINDOW_MINUTES = 15;

/**
 * One answer for every failure. A caller must not be able to learn that a phone
 * number has orders, or that an order number exists, by comparing messages.
 */
const UNIFORM_FAILURE = "We could not find an order with that number for that phone. Check both and try again.";

/**
 * The caller's address, salted and hashed. The salt is the session secret that
 * already exists, so no new configuration is needed and the raw address never
 * reaches the database.
 */
export function callerHash(address: string | null | undefined): string | null {
  const value = address?.split(",")[0]?.trim();
  if (!value) return null;
  const salt = process.env.CUSTOMER_SESSION_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}

export function normalizeOrderNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export type OrderLookupInput = {
  phone: string;
  orderNumber: string;
  caller: string | null;
};

export type OrderLookupResult = {
  orderId: string;
  orderNumber: string;
  customerId: string;
  normalizedPhone: string;
};

export async function lookupOrder(input: OrderLookupInput, now = new Date()): Promise<OrderLookupResult> {
  // A malformed phone is rejected before anything is recorded, so a typo cannot
  // spend one of the caller's five tries.
  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeKenyaPhone(input.phone);
  } catch {
    throw new OrderLookupError("Enter the M-Pesa number the order was placed with.");
  }
  const orderNumber = normalizeOrderNumber(input.orderNumber);
  if (!orderNumber) throw new OrderLookupError("Enter the order number from your confirmation message.");

  const caller = callerHash(input.caller);
  const since = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
  const [phoneFailures, callerAttempts] = await Promise.all([
    prisma.orderLookupAttempt.count({
      where: { normalizedPhone, succeeded: false, createdAt: { gte: since } }
    }),
    caller
      ? prisma.orderLookupAttempt.count({ where: { callerHash: caller, createdAt: { gte: since } } })
      : Promise.resolve(0)
  ]);
  if (phoneFailures >= MAX_ATTEMPTS_PER_PHONE || callerAttempts >= MAX_ATTEMPTS_PER_CALLER) {
    throw new OrderLookupThrottledError(
      `Too many attempts. Wait ${WINDOW_MINUTES} minutes and try again, or message us on WhatsApp and we will find it for you.`
    );
  }

  const order = await prisma.order.findFirst({
    where: {
      orderNumber,
      customer: {
        is: {
          // Guests are keyed by normalizedPhone; an account holder's M-Pesa
          // number lives on `phone`. Either proves ownership of this order.
          OR: [{ normalizedPhone }, { phone: normalizedPhone }]
        }
      }
    },
    select: { id: true, orderNumber: true, customerId: true }
  });

  await prisma.orderLookupAttempt.create({
    data: { normalizedPhone, callerHash: caller, succeeded: Boolean(order) }
  });
  if (!order) throw new OrderLookupError(UNIFORM_FAILURE);

  return { orderId: order.id, orderNumber: order.orderNumber, customerId: order.customerId, normalizedPhone };
}
