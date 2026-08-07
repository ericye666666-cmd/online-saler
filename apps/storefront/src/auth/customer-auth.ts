import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@online-saler/database";
import { normalizeCustomerEmail } from "@online-saler/business-rules";

export const CUSTOMER_SESSION_COOKIE = "direct_loop_customer";
export const GOOGLE_OAUTH_STATE_COOKIE = "direct_loop_google_state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type CustomerSession = {
  customerId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  expiresAt: number;
};

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function authSecret(): string {
  const value = process.env.CUSTOMER_SESSION_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("CUSTOMER_SESSION_SECRET must contain at least 32 characters.");
  return value;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

export function createSessionToken(session: CustomerSession): string {
  const payload = encode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined): CustomerSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CustomerSession;
    if (!parsed.customerId || !parsed.email || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function currentCustomerSession(): Promise<CustomerSession | null> {
  const store = await cookies();
  return parseSessionToken(store.get(CUSTOMER_SESSION_COOKIE)?.value);
}

export function newOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/checkout";
  return value;
}

export async function upsertGoogleCustomer(profile: GoogleProfile): Promise<CustomerSession> {
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error("Google account must provide a verified email address.");
  }
  const normalizedEmail = normalizeCustomerEmail(profile.email);
  const now = new Date();
  const customer = await prisma.customer.upsert({
    where: { googleSubjectId: profile.sub },
    create: {
      googleSubjectId: profile.sub,
      email: profile.email,
      normalizedEmail,
      emailVerified: true,
      displayName: profile.name?.trim() || null,
      avatarUrl: profile.picture?.trim() || null,
      lastLoginAt: now
    },
    update: {
      email: profile.email,
      normalizedEmail,
      emailVerified: true,
      displayName: profile.name?.trim() || null,
      avatarUrl: profile.picture?.trim() || null,
      lastLoginAt: now
    }
  });
  return {
    customerId: customer.id,
    email: customer.email,
    displayName: customer.displayName,
    avatarUrl: customer.avatarUrl,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  };
}

export const customerCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS
};
