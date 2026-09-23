import { pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * The code a customer reads out before a package changes hands.
 *
 * The rule it enforces is short: no code, no completion. A rider who says the
 * customer already has the goods, a store that recognises the buyer, a WhatsApp
 * message saying "received" — none of those complete an order. Only four digits
 * that came from the customer's own phone do.
 *
 * Because of that the code is never stored, logged or returned anywhere. What is
 * stored is a salted pbkdf2 hash, the same shape used for staff passwords. The
 * plaintext exists for the length of one dispatch transaction, inside the SMS
 * body, and then only in the customer's inbox. A leaked database therefore does
 * not let anyone complete an order, and no operations screen can show the code
 * to the wrong person because no code is there to show.
 *
 * A short code is only safe because guessing is expensive: four digits is 10,000
 * possibilities, so the attempt budget below is what does the real work.
 */

export const CUSTOMER_CODE_LENGTH = 4;

/**
 * Wrong codes allowed before the code is dead. Five is generous for a customer
 * reading digits over a noisy phone line, and far too few to guess one in
 * 10,000. A locked code cannot be retried, only replaced.
 */
export const CUSTOMER_CODE_MAX_ATTEMPTS = 5;

const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEY_BYTES = 32;
const PBKDF2_PREFIX = "pbkdf2_sha256";

export type CustomerCodeVerification =
  | { outcome: "VERIFIED" }
  | { outcome: "WRONG_CODE"; attemptsRemaining: number; nowLocked: boolean }
  | { outcome: "LOCKED" }
  | { outcome: "NO_CODE" }
  | { outcome: "ALREADY_USED" }
  | { outcome: "MALFORMED" };

export type CustomerCodeState = {
  codeHash: string | null | undefined;
  failedAttempts: number;
  lockedAt: Date | null | undefined;
  verifiedAt: Date | null | undefined;
};

/** A fresh uniformly-random code. `randomInt` is rejection-sampled, so 0000 is as likely as 9999. */
export function generateCustomerCode(): string {
  return String(randomInt(0, 10 ** CUSTOMER_CODE_LENGTH)).padStart(CUSTOMER_CODE_LENGTH, "0");
}

/** Digits only, so "58 32" and "5832" from a rider's keypad are the same code. */
export function normalizeCustomerCode(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function isWellFormedCustomerCode(value: string | null | undefined): boolean {
  return new RegExp(`^\\d{${CUSTOMER_CODE_LENGTH}}$`).test(normalizeCustomerCode(value));
}

export function hashCustomerCode(code: string, salt = randomBytes(16).toString("hex")): string {
  const digest = pbkdf2Sync(code, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, "sha256").toString("hex");
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${salt}$${digest}`;
}

/**
 * Constant-time comparison. A rider's app measuring how long a wrong code takes
 * to come back must learn nothing from it.
 */
export function customerCodeMatches(code: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const [algorithm, iterations, salt, digest] = storedHash.split("$");
  if (algorithm !== PBKDF2_PREFIX || !iterations || !salt || !digest) return false;
  const rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds <= 0) return false;
  const expected = pbkdf2Sync(normalizeCustomerCode(code), salt, rounds, PBKDF2_KEY_BYTES, "sha256");
  let actual: Buffer;
  try {
    actual = Buffer.from(digest, "hex");
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The single decision point for "may this package change hands". Every caller —
 * rider delivery, authorized drop-off, store pickup — goes through here, so
 * there is one place where the lockout and the one-time rule live.
 */
export function verifyCustomerCode(state: CustomerCodeState, submitted: string | null | undefined): CustomerCodeVerification {
  if (state.verifiedAt) return { outcome: "ALREADY_USED" };
  if (!state.codeHash) return { outcome: "NO_CODE" };
  if (state.lockedAt || state.failedAttempts >= CUSTOMER_CODE_MAX_ATTEMPTS) return { outcome: "LOCKED" };
  if (!isWellFormedCustomerCode(submitted)) return { outcome: "MALFORMED" };

  if (customerCodeMatches(normalizeCustomerCode(submitted), state.codeHash)) return { outcome: "VERIFIED" };

  const failedAttempts = state.failedAttempts + 1;
  return {
    outcome: "WRONG_CODE",
    attemptsRemaining: Math.max(0, CUSTOMER_CODE_MAX_ATTEMPTS - failedAttempts),
    nowLocked: failedAttempts >= CUSTOMER_CODE_MAX_ATTEMPTS
  };
}

/** What the person holding the package is told. Never how many digits were right. */
export function customerCodeFailureMessage(result: CustomerCodeVerification): string {
  switch (result.outcome) {
    case "WRONG_CODE":
      return result.nowLocked
        ? "That code is wrong and this order is now locked. Call the store to have a new code sent to the customer."
        : `That code is wrong. ${result.attemptsRemaining} attempt(s) left before this order locks.`;
    case "LOCKED":
      return "Too many wrong codes. Call the store to have a new code sent to the customer.";
    case "NO_CODE":
      return "No delivery code has been issued for this order yet.";
    case "ALREADY_USED":
      return "This code has already been used and is no longer valid.";
    case "MALFORMED":
      return `Enter the ${CUSTOMER_CODE_LENGTH} digits the customer received by SMS.`;
    case "VERIFIED":
      return "";
  }
}
