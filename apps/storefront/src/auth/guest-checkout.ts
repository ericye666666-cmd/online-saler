import { cookies } from "next/headers";
import { Prisma, prisma } from "@online-saler/database";
import { createSignedToken, readSignedToken } from "./customer-auth";

export const GUEST_CHECKOUT_COOKIE = "direct_loop_guest";
const GUEST_TTL_SECONDS = 60 * 60 * 24 * 30;
// The cookie travels on every storefront request, so only the most recent orders
// are kept addressable from this device. Older ones go through customer service.
const MAX_REMEMBERED_ORDERS = 20;

export type GuestCheckout = {
  customerId: string;
  phone: string;
  /**
   * Orders started from this browser. A guest is trusted with these and nothing
   * else: typing someone else's M-Pesa number must never expose their history.
   */
  orderIds: string[];
  expiresAt: number;
};

export const guestCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: GUEST_TTL_SECONDS
};

export function parseGuestCheckout(token: string | undefined): GuestCheckout | null {
  const parsed = readSignedToken<GuestCheckout>(token);
  if (!parsed) return null;
  if (!parsed.customerId || !parsed.phone || parsed.expiresAt <= Date.now()) return null;
  return { ...parsed, orderIds: Array.isArray(parsed.orderIds) ? parsed.orderIds : [] };
}

export async function currentGuestCheckout(): Promise<GuestCheckout | null> {
  const store = await cookies();
  return parseGuestCheckout(store.get(GUEST_CHECKOUT_COOKIE)?.value);
}

/**
 * Adds an order to the device's guest cookie. Called after checkout succeeds so
 * the shopper can poll payment status and reopen the order without signing in.
 */
export function rememberGuestOrder(current: GuestCheckout | null, customerId: string, phone: string, orderId: string): GuestCheckout {
  const previous = current && current.customerId === customerId ? current.orderIds : [];
  const orderIds = [orderId, ...previous.filter((id) => id !== orderId)].slice(0, MAX_REMEMBERED_ORDERS);
  return { customerId, phone, orderIds, expiresAt: Date.now() + GUEST_TTL_SECONDS * 1000 };
}

export function guestCheckoutToken(guest: GuestCheckout): string {
  return createSignedToken(guest);
}

/**
 * Resolves the Customer record behind a normalized M-Pesa phone, creating one on
 * the shopper's first order. The phone is the account; no email, no password.
 */
export async function findOrCreateGuestCustomer(normalizedPhone: string): Promise<{ id: string }> {
  try {
    return await prisma.customer.upsert({
      where: { normalizedPhone },
      create: { normalizedPhone, phone: normalizedPhone, lastLoginAt: new Date() },
      update: { lastLoginAt: new Date() },
      select: { id: true }
    });
  } catch (error) {
    // Two tabs starting a first order at once race on the unique phone index.
    // The loser reads the row the winner just wrote instead of failing checkout.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await prisma.customer.findUnique({ where: { normalizedPhone }, select: { id: true } });
    if (!existing) throw error;
    return existing;
  }
}
