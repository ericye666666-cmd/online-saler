import { clampNotificationBody, type NotificationTopicName } from "./notification-topics";

/**
 * Message bodies for the notification outbox. They are deliberately plain: SMS
 * is the reliable channel in Kenya, so every message fits one segment, names
 * the order, and tells the reader the single next thing they do.
 */

export type NotificationTemplateInput = {
  orderNumber: string;
  /**
   * The only place a delivery code is ever written. It reaches this function
   * inside the dispatch transaction and goes straight into an SMS body; it is
   * never persisted, returned by an API or shown on an operations screen.
   */
  deliveryCode?: string | null;
  customerName?: string | null;
  nodeName?: string | null;
  amountKsh?: number | null;
  itemTitle?: string | null;
  itemCount?: number | null;
  riderName?: string | null;
  pickupCode?: string | null;
  affiliateName?: string | null;
  supportPhone?: string | null;
  reason?: string | null;
  /** What is still owed on a deposit order. */
  balanceKsh?: number | null;
  /** Whole days left before a deposit hold lapses. */
  daysLeft?: number | null;
  /** The deadline as the shopper reads it, e.g. "Mon 30 Sep". */
  dueDateLabel?: string | null;
};

function money(amountKsh: number | null | undefined): string {
  return typeof amountKsh === "number" ? `KSh ${amountKsh.toLocaleString("en-KE")}` : "";
}

function items(input: NotificationTemplateInput): string {
  if (input.itemTitle) return input.itemTitle;
  const count = input.itemCount ?? 0;
  return count === 1 ? "1 item" : `${count} items`;
}

const templates: Record<NotificationTopicName, (input: NotificationTemplateInput) => string> = {
  CUSTOMER_PAYMENT_SUCCESS: (input) =>
    `Direct Loop: payment received for order ${input.orderNumber}${input.amountKsh ? ` (${money(input.amountKsh)})` : ""}. We are preparing ${items(input)} now. Questions? ${input.supportPhone ?? ""}`,
  // The three deposit messages all lead with the same two facts, because they
  // are the only two that matter to someone who has paid half: what is left to
  // pay, and the day it has to be paid by.
  CUSTOMER_DEPOSIT_RECEIVED: (input) =>
    `Direct Loop: deposit received for order ${input.orderNumber}. ${items(input)} held. Balance ${money(input.balanceKsh)} due by ${input.dueDateLabel ?? "the due date"} or it goes back on sale. ${input.supportPhone ?? ""}`,
  CUSTOMER_DEPOSIT_BALANCE_DUE: (input) =>
    `Direct Loop: ${input.daysLeft === 1 ? "last day" : `${input.daysLeft ?? ""} days left`} to pay the ${money(input.balanceKsh)} balance on order ${input.orderNumber}. Pay by ${input.dueDateLabel ?? "the due date"} to keep ${items(input)}. ${input.supportPhone ?? ""}`,
  // Says plainly that money is coming back and that it is not all of it. A
  // shopper who reads "refund" and expects the full deposit calls support.
  CUSTOMER_DEPOSIT_EXPIRED: (input) =>
    `Direct Loop: the balance on order ${input.orderNumber} was not paid in time, so ${items(input)} went back on sale. ${money(input.amountKsh)} of your deposit returns to your M-Pesa. ${input.supportPhone ?? ""}`,

  // No map link. Two reasons, and either alone would be enough.
  //
  // The DIRECTLOOP sender id was registered with Safaricom as Transactional
  // against four declared message formats, none of which carries a URL, and
  // promotional traffic on it costs KES 25,000. A shortened link is the single
  // clearest marker a bulk-SMS filter reads as marketing.
  //
  // It also doubled the cost: with the link this message ran to 157 characters,
  // which is two segments. Without it, 107 — one. The map is on the shopper's
  // own order page, where it can be tapped rather than retyped.
  CUSTOMER_ORDER_READY_FOR_PICKUP: (input) =>
    `Direct Loop: order ${input.orderNumber} is ready for pickup at ${input.nodeName ?? "our store"}. Pickup code ${input.pickupCode ?? input.orderNumber}. ${input.supportPhone ?? ""}`,
  CUSTOMER_ORDER_DISPATCHED: (input) =>
    `Direct Loop: order ${input.orderNumber} is on the way${input.riderName ? ` with ${input.riderName}` : ""}. Please keep your phone on. ${input.supportPhone ?? ""}`,
  // The instruction matters as much as the digits: a code given before the goods
  // are in hand is the one way this check can be defeated.
  CUSTOMER_DELIVERY_CODE: (input) =>
    `Direct Loop: order ${input.orderNumber} is out for delivery${input.riderName ? ` with ${input.riderName}` : ""}. Delivery code ${input.deliveryCode ?? ""}. Give this code to the rider only after you have received your order. ${input.supportPhone ?? ""}`,
  CUSTOMER_DELIVERY_FAILED: (input) =>
    `Direct Loop: we could not deliver order ${input.orderNumber} today${input.reason ? ` (${input.reason})` : ""}. Your payment is safe and we will try again. ${input.supportPhone ?? ""}`,
  CUSTOMER_ORDER_COMPLETED: (input) =>
    `Direct Loop: order ${input.orderNumber} is complete. If anything is wrong, tell us within 24 hours on ${input.supportPhone ?? "WhatsApp"}.`,
  CUSTOMER_REFUND_RECORDED: (input) =>
    `Direct Loop: a refund of ${money(input.amountKsh)} for order ${input.orderNumber} has been sent to your M-Pesa number. ${input.supportPhone ?? ""}`,

  // Not sent. The DIRECTLOOP sender id is registered as Transactional with
  // Safaricom, and promotional traffic on it carries a KES 25,000 fine, so
  // affiliate encouragement has no sender id to go out on. The bodies stay here
  // as the catalogue; sending them again needs a second, promotional sender id.
  AFFILIATE_FIRST_SALE: (input) =>
    `Direct Loop: your first sale is in. Order ${input.orderNumber}${input.amountKsh ? `, commission ${money(input.amountKsh)}` : ""}. Keep posting — every item is one of one.`,
  AFFILIATE_NEW_ORDER: (input) =>
    `Direct Loop: someone bought through your link. Order ${input.orderNumber}${input.amountKsh ? `, commission ${money(input.amountKsh)} pending` : ""}.`,
  AFFILIATE_COMMISSION_AVAILABLE: (input) =>
    `Direct Loop: ${money(input.amountKsh)} commission for order ${input.orderNumber} is now available for payout.`,
  AFFILIATE_COMMISSION_PAID: (input) =>
    `Direct Loop: ${money(input.amountKsh)} commission has been paid out to you for order ${input.orderNumber}.`,

  NODE_PACKAGE_IN_TRANSIT: (input) =>
    `Direct Loop: a package for order ${input.orderNumber} is on its way to ${input.nodeName ?? "your store"}. Scan it in when it arrives.`,
  NODE_PACKAGE_AWAITING_DISPATCH: (input) =>
    `Direct Loop: order ${input.orderNumber} at ${input.nodeName ?? "your store"} is waiting for a Bolt rider. Record the actual fare after dispatch.`,

  WAREHOUSE_NEW_PAID_ORDER: (input) =>
    `Direct Loop: new paid order ${input.orderNumber} (${items(input)}) is waiting to be picked.`,

  ADMIN_PAYMENT_EXCEPTION: (input) =>
    `Direct Loop alert: payment on order ${input.orderNumber} needs review${input.reason ? ` — ${input.reason}` : ""}.`,
  ADMIN_FULFILLMENT_EXCEPTION: (input) =>
    `Direct Loop alert: fulfillment exception on order ${input.orderNumber}${input.reason ? ` — ${input.reason}` : ""}.`
};

export function notificationBody(topic: NotificationTopicName, input: NotificationTemplateInput): string {
  return clampNotificationBody(templates[topic](input));
}
