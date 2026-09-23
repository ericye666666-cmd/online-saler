/**
 * The message a store sends a customer by hand, because the SMS provider is not
 * live yet.
 *
 * It carries a link to the customer's own order page, never the code itself.
 * That is the whole point: the code stays something only the customer can read,
 * so the person who dispatched the package still cannot complete it alone. A
 * staff member who could paste the code into WhatsApp could also paste it into
 * the verification box.
 *
 * Every store phone already has WhatsApp, which is why this is the fallback and
 * not a second SMS vendor.
 */

/** Where the shopper's order page lives. Overridable so staging can point at itself. */
export const STOREFRONT_URL = (process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "https://dloop.co.ke").replace(/\/+$/, "");

export function customerOrderUrl(orderNumber: string): string {
  return `${STOREFRONT_URL}/orders/${encodeURIComponent(orderNumber)}`;
}

/**
 * Kenyan numbers reach WhatsApp as 2547........ `wa.me` rejects a leading zero,
 * a plus sign and any spacing, so a number typed as "0712 345 678" has to be
 * rewritten before it is a link rather than a dead end.
 */
export function whatsappNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("254")) return digits.length >= 12 ? digits : null;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  // A bare 712345678, as people write it when the country code is assumed.
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

type CustomerMessage = {
  orderNumber: string;
  phone: string | null | undefined;
  kind: "DELIVERY" | "PICKUP";
  nodeName?: string | null;
};

/**
 * Returns null when there is no reachable number — the caller then shows why
 * the button is missing instead of opening WhatsApp on nothing.
 */
export function customerWhatsappUrl(message: CustomerMessage): string | null {
  const number = whatsappNumber(message.phone);
  if (!number) return null;
  const url = customerOrderUrl(message.orderNumber);
  const body = message.kind === "DELIVERY"
    ? `Direct Loop: your order ${message.orderNumber} is on its way. Open ${url} to see your 4-digit delivery code. Give the code to the rider only after you have your order in your hands.`
    : `Direct Loop: your order ${message.orderNumber} is ready for collection${message.nodeName ? ` at ${message.nodeName}` : ""}. Open ${url} to see your pickup code, and bring it with you.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
}
