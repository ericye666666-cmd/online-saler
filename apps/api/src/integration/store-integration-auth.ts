import { UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Authentication for the store ERP (FW-ERP / YXSYSTEM), which calls this API
 * server-to-server so its store staff can work online orders from the workbench
 * they already use.
 *
 * This is a machine credential, not a person's: it says "the store system is
 * calling", never "this store may act". Which store may act on which packages is
 * decided from the store code in the path, checked against the fulfillment node
 * that owns the package — see `StoreIntegrationService`.
 *
 * The key lives only in Secret Manager and reaches this process as an
 * environment variable. It is never in the repository, never in a response, and
 * never sent to a browser: the store ERP's own backend holds it, so a store
 * clerk's phone never sees it.
 */

const KEY_HEADER = "x-store-integration-key";

/** Compares digests rather than raw keys, so length never leaks through timing. */
function keysMatch(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function storeIntegrationKeyHeader(): string {
  return KEY_HEADER;
}

/**
 * Throws unless the caller presented the configured key.
 *
 * With no key configured the integration is closed rather than open: an
 * environment that forgot to set the secret refuses every call instead of
 * accepting anonymous ones.
 */
export function assertStoreIntegrationKey(provided: string | undefined): void {
  const expected = process.env.STORE_INTEGRATION_KEY?.trim();
  if (!expected) {
    throw new UnauthorizedException("The store integration is not configured on this environment.");
  }
  const value = provided?.trim();
  if (!value || !keysMatch(value, expected)) {
    throw new UnauthorizedException("The store integration key is missing or wrong.");
  }
}

/**
 * The person on the shop floor, as the store ERP knows them. They have no
 * account here, so their name rides along on the fulfillment event instead of
 * being invented as an employee record. "Who received this package" stays
 * answerable without two systems having to share a user table.
 */
export type StoreIntegrationActor = {
  staffName: string | null;
  staffId: string | null;
};

export function readStoreIntegrationActor(input: {
  staffName?: string | null;
  staffId?: string | null;
}): StoreIntegrationActor {
  const staffName = input.staffName?.trim() || null;
  const staffId = input.staffId?.trim() || null;
  return { staffName, staffId };
}

/** How the acting clerk is written into the fulfillment event log. */
export function storeActorNote(actor: StoreIntegrationActor, storeCode: string, note?: string | null): string {
  const who = actor.staffName
    ? `${actor.staffName}${actor.staffId ? ` (${actor.staffId})` : ""}`
    : "store staff";
  const source = `via the ${storeCode.toUpperCase()} store system — ${who}`;
  const trimmed = note?.trim();
  return trimmed ? `${trimmed} — ${source}` : source;
}
