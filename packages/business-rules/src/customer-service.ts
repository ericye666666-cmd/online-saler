/**
 * What a customer service case is about, who owns it, and when it is late.
 *
 * The workbench has always grouped cases into six coarse queues (payment,
 * pickup, delivery, after-sale, order, other). Customer service needs to say
 * something far more specific than that -- "the delivery code never arrived" is
 * not the same job as "the rider was rude" -- but the queues still have to
 * work, and so do the rows written before this taxonomy existed.
 *
 * So the specific reason is the thing an agent picks, and the coarse queue is
 * derived from it. Nobody sets the queue by hand, which means the two can never
 * disagree.
 */

export const CUSTOMER_SERVICE_CASE_TYPES = [
  "PAYMENT_FAILED",
  "PAID_BUT_ORDER_MISSING",
  "DUPLICATE_PAYMENT",
  "PAYMENT_PENDING",
  "WRONG_AMOUNT",
  "ORDER_LATE",
  "CUSTOMER_UNREACHABLE",
  "WRONG_ADDRESS",
  "RIDER_ISSUE",
  "PACKAGE_MISSING",
  "DELIVERY_CODE_NOT_RECEIVED",
  "WRONG_ITEM",
  "DAMAGED_ITEM",
  "MISSING_ITEM",
  "SIZE_ISSUE",
  "PRODUCT_NOT_AS_EXPECTED",
  "RETURN_REQUEST",
  "EXCHANGE_REQUEST",
  "REFUND_REQUEST",
  "OTHER"
] as const;

export type CustomerServiceCaseTypeName = (typeof CUSTOMER_SERVICE_CASE_TYPES)[number];

/** The five groups the case-type picker is organised into on screen. */
export const CUSTOMER_SERVICE_CASE_GROUPS = ["PAYMENT", "DELIVERY", "PRODUCT", "AFTER_SALES", "OTHER"] as const;

export type CustomerServiceCaseGroupName = (typeof CUSTOMER_SERVICE_CASE_GROUPS)[number];

export type CustomerServiceIssueTypeName = "PAYMENT" | "PICKUP" | "DELIVERY" | "AFTER_SALE" | "ORDER" | "OTHER";

export type CustomerServicePriorityName = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type CustomerServiceEscalationTargetName = "FULFILLMENT" | "FINANCE" | "ADMIN";

type CaseTypeRule = {
  group: CustomerServiceCaseGroupName;
  /** The pre-existing coarse queue this reason belongs in. */
  issueType: CustomerServiceIssueTypeName;
  /**
   * Where this reason goes when customer service cannot finish it alone. It is
   * a suggestion the agent can override, not a routing decision -- a duplicate
   * payment is finance's problem, but the agent is the one who saw the case.
   */
  escalatesTo: CustomerServiceEscalationTargetName;
  /** Starting urgency. An agent can raise or lower it on any case. */
  priority: CustomerServicePriorityName;
};

const CASE_TYPE_RULES: Record<CustomerServiceCaseTypeName, CaseTypeRule> = {
  // Money the customer believes they have already paid. Everything here is at
  // least HIGH: the customer is out of pocket until somebody answers.
  PAYMENT_FAILED: { group: "PAYMENT", issueType: "PAYMENT", escalatesTo: "FINANCE", priority: "HIGH" },
  PAID_BUT_ORDER_MISSING: { group: "PAYMENT", issueType: "PAYMENT", escalatesTo: "FINANCE", priority: "URGENT" },
  DUPLICATE_PAYMENT: { group: "PAYMENT", issueType: "PAYMENT", escalatesTo: "FINANCE", priority: "URGENT" },
  PAYMENT_PENDING: { group: "PAYMENT", issueType: "PAYMENT", escalatesTo: "FINANCE", priority: "HIGH" },
  WRONG_AMOUNT: { group: "PAYMENT", issueType: "PAYMENT", escalatesTo: "FINANCE", priority: "HIGH" },

  ORDER_LATE: { group: "DELIVERY", issueType: "DELIVERY", escalatesTo: "FULFILLMENT", priority: "HIGH" },
  CUSTOMER_UNREACHABLE: { group: "DELIVERY", issueType: "DELIVERY", escalatesTo: "FULFILLMENT", priority: "NORMAL" },
  WRONG_ADDRESS: { group: "DELIVERY", issueType: "DELIVERY", escalatesTo: "FULFILLMENT", priority: "HIGH" },
  RIDER_ISSUE: { group: "DELIVERY", issueType: "DELIVERY", escalatesTo: "FULFILLMENT", priority: "HIGH" },
  // A paid parcel nobody can account for is the worst thing on this list.
  PACKAGE_MISSING: { group: "DELIVERY", issueType: "DELIVERY", escalatesTo: "FULFILLMENT", priority: "URGENT" },
  // The customer cannot take delivery without it, and the rider cannot close
  // the order without it, so this one blocks both sides at once.
  DELIVERY_CODE_NOT_RECEIVED: { group: "DELIVERY", issueType: "DELIVERY", escalatesTo: "FULFILLMENT", priority: "URGENT" },

  // Every garment is one of one, so a product complaint is always about a
  // specific item that cannot simply be swapped for another of the same kind.
  WRONG_ITEM: { group: "PRODUCT", issueType: "AFTER_SALE", escalatesTo: "FULFILLMENT", priority: "HIGH" },
  DAMAGED_ITEM: { group: "PRODUCT", issueType: "AFTER_SALE", escalatesTo: "FULFILLMENT", priority: "HIGH" },
  MISSING_ITEM: { group: "PRODUCT", issueType: "AFTER_SALE", escalatesTo: "FULFILLMENT", priority: "HIGH" },
  SIZE_ISSUE: { group: "PRODUCT", issueType: "AFTER_SALE", escalatesTo: "FULFILLMENT", priority: "NORMAL" },
  PRODUCT_NOT_AS_EXPECTED: { group: "PRODUCT", issueType: "AFTER_SALE", escalatesTo: "FULFILLMENT", priority: "NORMAL" },

  RETURN_REQUEST: { group: "AFTER_SALES", issueType: "AFTER_SALE", escalatesTo: "FULFILLMENT", priority: "NORMAL" },
  EXCHANGE_REQUEST: { group: "AFTER_SALES", issueType: "AFTER_SALE", escalatesTo: "FULFILLMENT", priority: "NORMAL" },
  REFUND_REQUEST: { group: "AFTER_SALES", issueType: "AFTER_SALE", escalatesTo: "FINANCE", priority: "HIGH" },

  OTHER: { group: "OTHER", issueType: "OTHER", escalatesTo: "ADMIN", priority: "NORMAL" }
};

export function isCustomerServiceCaseType(value: unknown): value is CustomerServiceCaseTypeName {
  return typeof value === "string" && value in CASE_TYPE_RULES;
}

/** The coarse queue a reason belongs to. Never set by hand. */
export function issueTypeForCaseType(caseType: CustomerServiceCaseTypeName): CustomerServiceIssueTypeName {
  return CASE_TYPE_RULES[caseType].issueType;
}

export function caseGroupForCaseType(caseType: CustomerServiceCaseTypeName): CustomerServiceCaseGroupName {
  return CASE_TYPE_RULES[caseType].group;
}

export function suggestedEscalationTarget(caseType: CustomerServiceCaseTypeName): CustomerServiceEscalationTargetName {
  return CASE_TYPE_RULES[caseType].escalatesTo;
}

export function defaultPriorityForCaseType(caseType: CustomerServiceCaseTypeName): CustomerServicePriorityName {
  return CASE_TYPE_RULES[caseType].priority;
}

/** The picker, grouped, in the order the groups are listed in the spec. */
export function customerServiceCaseTypesByGroup(): Array<{
  group: CustomerServiceCaseGroupName;
  caseTypes: CustomerServiceCaseTypeName[];
}> {
  return CUSTOMER_SERVICE_CASE_GROUPS.map((group) => ({
    group,
    caseTypes: CUSTOMER_SERVICE_CASE_TYPES.filter((caseType) => CASE_TYPE_RULES[caseType].group === group)
  }));
}

/**
 * How long each priority gets before the case is late, in hours.
 *
 * These are the defaults. They are deliberately short: a Kikuyu customer who
 * paid by M-Pesa and got nothing does not wait a working day. Operations can
 * override them per priority in system settings without a deploy.
 */
export const DEFAULT_CUSTOMER_SERVICE_SLA_HOURS: Record<CustomerServicePriorityName, number> = {
  URGENT: 2,
  HIGH: 4,
  NORMAL: 12,
  LOW: 24
};

export const CUSTOMER_SERVICE_SLA_SETTING_KEY = "customer-service.sla-hours";

/**
 * Reads an SLA override out of system settings, keeping any priority the stored
 * value does not mention. A malformed or hostile setting falls back to the
 * default rather than producing a case with no deadline at all.
 */
export function resolveCustomerServiceSlaHours(stored: unknown): Record<CustomerServicePriorityName, number> {
  const resolved = { ...DEFAULT_CUSTOMER_SERVICE_SLA_HOURS };
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return resolved;
  for (const priority of Object.keys(resolved) as CustomerServicePriorityName[]) {
    const value = (stored as Record<string, unknown>)[priority];
    // A zero or negative deadline would mark every new case overdue on sight.
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 24 * 30) {
      resolved[priority] = value;
    }
  }
  return resolved;
}

/** When a case opened at `createdAt` becomes late. */
export function customerServiceSlaDueAt(
  priority: CustomerServicePriorityName,
  createdAt: Date,
  slaHours: Record<CustomerServicePriorityName, number> = DEFAULT_CUSTOMER_SERVICE_SLA_HOURS
): Date {
  return new Date(createdAt.getTime() + slaHours[priority] * 60 * 60 * 1000);
}

/**
 * A case is overdue only while somebody still owes the customer an answer.
 * Once it is resolved or closed the deadline stops mattering, even if it was
 * missed -- the dashboard counts work outstanding, not history.
 */
export function isCustomerServiceCaseOverdue(
  serviceCase: { status: string; slaDueAt?: Date | null },
  now = new Date()
): boolean {
  if (serviceCase.status !== "OPEN" && serviceCase.status !== "IN_PROGRESS") return false;
  return Boolean(serviceCase.slaDueAt && serviceCase.slaDueAt.getTime() <= now.getTime());
}

/**
 * Opens a WhatsApp conversation with a customer on their own number.
 *
 * WhatsApp stays the channel; this only saves the agent from copying digits
 * into their phone. Returns null when there is no number to open, so the button
 * can be hidden rather than opening a broken chat.
 */
export function whatsAppLinkForPhone(phone: string | null | undefined, message?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const normalized = /^0[17]\d{8}$/.test(digits)
    ? `254${digits.slice(1)}`
    : /^[17]\d{8}$/.test(digits)
      ? `254${digits}`
      : /^254[17]\d{8}$/.test(digits)
        ? digits
        : null;
  if (!normalized) return null;
  const query = message?.trim() ? `?text=${encodeURIComponent(message.trim())}` : "";
  return `https://wa.me/${normalized}${query}`;
}
