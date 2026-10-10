/**
 * The "分销团队增长" part of the business report: how many promoters there
 * are, who is actually sharing, who has gone quiet, and how much of the result
 * comes from people outside the company.
 *
 * Pure: it takes rows already read from the database and does the counting,
 * so it can be tested without one. business-report-service does the reading.
 *
 * Definitions follow the 推广中心 page in the operations app
 * (apps/api/src/operations/operations-affiliate.service.ts listAffiliates) so
 * the numbers can be checked against it:
 *   - a click is one AffiliateClick row (counted by clickedAt);
 *   - an order is a paid order whose Order.affiliateId is the promoter. In the
 *     report it is counted in the period its last payment cleared, the same
 *     rule as 成交订单 in the sales section;
 *   - sales (GMV) is the order's item subtotal, delivery fee excluded, like
 *     "带来销售额" on 推广中心 and like the commission base;
 *   - conversion is paid orders ÷ clicks, like "转化率" on 推广中心;
 *   - last click is the newest AffiliateClick.clickedAt, like "最近点击".
 */

export type Comparable = { current: number; previous: number };

export const DORMANT_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const RANKING_SIZE = 10;
const DORMANT_LIST_SIZE = 10;

export type AffiliateRow = {
  id: string;
  displayName: string;
  affiliateCode: string;
  phone: string | null;
  email: string | null;
  status: "ACTIVE" | "DISABLED" | string;
  createdAt: Date;
  disabledAt: Date | null;
  /** The shop account the promoter was enabled from, if any. */
  customer: { phone: string | null; email: string | null } | null;
};

/** One active staff account: an Employee or an AdminUser (operations login). */
export type StaffRow = {
  /** What the email shows after "员工", e.g. the login account "Faith2026". */
  label: string;
  name: string | null;
  phones: Array<string | null>;
  emails: Array<string | null>;
};

export type StaffMatch = { staffLabel: string; by: "phone" | "email" | "name" };

export type AttributedOrder = { affiliateId: string | null; itemSubtotalKsh: number };
export type PerAffiliateCount = { affiliateId: string; count: number };
export type PerAffiliateKsh = { affiliateId: string; amountKsh: number };

export type AffiliateTotals = {
  clicks: Comparable;
  orders: Comparable;
  gmvKsh: Comparable;
  commissionKsh: Comparable;
};

export type AffiliateTeamReport = {
  /** Promoters who existed and were not disabled at the end of each period. */
  totalAffiliates: Comparable;
  newAffiliates: Comparable;
  /** Promoters whose links got at least one click in the period. */
  activeAffiliates: Comparable;
  all: AffiliateTotals;
  /** Promoters who are not company staff (see matchStaffAffiliates). */
  external: AffiliateTotals;
  staff: AffiliateTotals;
  /** Commission marked paid in the period. */
  commissionPaidKsh: number;
  ranking: Array<{
    name: string;
    code: string;
    isStaff: boolean;
    clicks: number;
    orders: number;
    gmvKsh: number;
    commissionKsh: number;
  }>;
  /** Right now: active promoters with no click in the last seven days. */
  dormant: {
    count: number;
    of: number;
    list: Array<{ name: string; code: string; isStaff: boolean; daysSinceLastClick: number | null; daysSinceJoined: number }>;
  };
  /** Who was counted as staff and why, so the owner can check the rule. */
  staffAffiliates: Array<{ name: string; code: string } & StaffMatch>;
};

/** Same rule as normalizeKenyaPhone in checkout: 07xx / 7xx / +2547xx all become 2547xx. */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

function normalizeName(value: string | null | undefined): string | null {
  const words = value?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  // A single first name ("Faith", "John") is too common to prove anything.
  return words.length >= 2 ? words.join(" ") : null;
}

/**
 * Which promoters are the company's own staff.
 *
 * The schema has no column linking an Affiliate to an Employee or AdminUser,
 * so staff are recognised by contact details, against Employee and AdminUser
 * records whose status is ACTIVE:
 *   1. phone: the promoter's phone, or the phone of the shop account it was
 *      enabled from, equals a staff phone after normalising 07xx / +2547xx;
 *   2. email: the promoter's or its shop account's email equals a staff email
 *      (case-insensitive). An AdminUser's login account counts as a phone or
 *      email when it looks like one;
 *   3. name: only if neither matched, the full display name (two words or
 *      more, case and spacing ignored) equals a staff member's full name.
 * Everyone else is external. The email lists each staff promoter with the rule
 * that matched, so a wrong match is visible and can be fixed at the source.
 */
export function matchStaffAffiliates(affiliates: AffiliateRow[], staff: StaffRow[]): Map<string, StaffMatch> {
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const person of staff) {
    for (const phone of person.phones) {
      const key = normalizePhone(phone);
      if (key && !byPhone.has(key)) byPhone.set(key, person.label);
    }
    for (const email of person.emails) {
      const key = normalizeEmail(email);
      if (key && !byEmail.has(key)) byEmail.set(key, person.label);
    }
    const name = normalizeName(person.name);
    if (name && !byName.has(name)) byName.set(name, person.label);
  }

  const matches = new Map<string, StaffMatch>();
  for (const affiliate of affiliates) {
    const phones = [affiliate.phone, affiliate.customer?.phone].map(normalizePhone).filter((p): p is string => !!p);
    const emails = [affiliate.email, affiliate.customer?.email].map(normalizeEmail).filter((e): e is string => !!e);
    const phoneHit = phones.map((p) => byPhone.get(p)).find(Boolean);
    if (phoneHit) {
      matches.set(affiliate.id, { staffLabel: phoneHit, by: "phone" });
      continue;
    }
    const emailHit = emails.map((e) => byEmail.get(e)).find(Boolean);
    if (emailHit) {
      matches.set(affiliate.id, { staffLabel: emailHit, by: "email" });
      continue;
    }
    const name = normalizeName(affiliate.displayName);
    const nameHit = name ? byName.get(name) : undefined;
    if (nameHit) matches.set(affiliate.id, { staffLabel: nameHit, by: "name" });
  }
  return matches;
}

export type AffiliateTeamInput = {
  period: { start: Date; end: Date; previousStart: Date; previousEnd: Date };
  now: Date;
  affiliates: AffiliateRow[];
  staff: StaffRow[];
  clicks: { current: PerAffiliateCount[]; previous: PerAffiliateCount[] };
  /** Newest click ever per promoter. */
  lastClicks: Array<{ affiliateId: string; lastClickAt: Date | null }>;
  orders: { current: AttributedOrder[]; previous: AttributedOrder[] };
  /** Commission created in the period, rejected excluded. */
  commission: { current: PerAffiliateKsh[]; previous: PerAffiliateKsh[] };
  commissionPaidKsh: number;
};

export function buildAffiliateTeam(input: AffiliateTeamInput): AffiliateTeamReport {
  const { period, now, affiliates } = input;
  const staffMatches = matchStaffAffiliates(affiliates, input.staff);
  const isStaff = (id: string) => staffMatches.has(id);
  const byId = new Map(affiliates.map((a) => [a.id, a]));

  const existedAt = (a: AffiliateRow, instant: Date) => {
    if (a.createdAt >= instant) return false;
    if (a.disabledAt) return a.disabledAt >= instant;
    return a.status !== "DISABLED";
  };
  const createdIn = (a: AffiliateRow, start: Date, end: Date) => a.createdAt >= start && a.createdAt < end;

  const clicksNow = tally(input.clicks.current, (r) => r.count);
  const clicksBefore = tally(input.clicks.previous, (r) => r.count);
  const ordersNow = tally(attributed(input.orders.current), () => 1);
  const ordersBefore = tally(attributed(input.orders.previous), () => 1);
  const gmvNow = tally(attributed(input.orders.current), (o) => o.itemSubtotalKsh);
  const gmvBefore = tally(attributed(input.orders.previous), (o) => o.itemSubtotalKsh);
  const commissionNow = tally(input.commission.current, (r) => r.amountKsh);
  const commissionBefore = tally(input.commission.previous, (r) => r.amountKsh);

  const totals = (keep: (id: string) => boolean): AffiliateTotals => ({
    clicks: { current: total(clicksNow, keep), previous: total(clicksBefore, keep) },
    orders: { current: total(ordersNow, keep), previous: total(ordersBefore, keep) },
    gmvKsh: { current: total(gmvNow, keep), previous: total(gmvBefore, keep) },
    commissionKsh: { current: total(commissionNow, keep), previous: total(commissionBefore, keep) }
  });

  const rankedIds = new Set([...clicksNow.keys(), ...ordersNow.keys(), ...commissionNow.keys()]);
  const ranking = [...rankedIds]
    .map((id) => ({
      name: byId.get(id)?.displayName ?? "Unknown",
      code: byId.get(id)?.affiliateCode ?? "",
      isStaff: isStaff(id),
      clicks: clicksNow.get(id) ?? 0,
      orders: ordersNow.get(id) ?? 0,
      gmvKsh: gmvNow.get(id) ?? 0,
      commissionKsh: commissionNow.get(id) ?? 0
    }))
    .sort((a, b) => b.orders - a.orders || b.clicks - a.clicks || b.gmvKsh - a.gmvKsh || a.name.localeCompare(b.name))
    .slice(0, RANKING_SIZE);

  const lastClick = new Map(input.lastClicks.map((row) => [row.affiliateId, row.lastClickAt]));
  const dormantSince = now.getTime() - DORMANT_AFTER_DAYS * DAY_MS;
  const activeNow = affiliates.filter((a) => a.status === "ACTIVE" && !a.disabledAt && a.createdAt <= now);
  const dormant = activeNow
    .filter((a) => {
      const last = lastClick.get(a.id);
      return !last || last.getTime() <= dormantSince;
    })
    .map((a) => {
      const last = lastClick.get(a.id) ?? null;
      return {
        name: a.displayName,
        code: a.affiliateCode,
        isStaff: isStaff(a.id),
        daysSinceLastClick: last ? Math.floor((now.getTime() - last.getTime()) / DAY_MS) : null,
        daysSinceJoined: Math.floor((now.getTime() - a.createdAt.getTime()) / DAY_MS),
        quietSince: (last ?? a.createdAt).getTime()
      };
    })
    // Longest silence first; a promoter who never got a click counts from the day they joined.
    .sort((a, b) => a.quietSince - b.quietSince || a.name.localeCompare(b.name));

  return {
    totalAffiliates: {
      current: affiliates.filter((a) => existedAt(a, period.end)).length,
      previous: affiliates.filter((a) => existedAt(a, period.previousEnd)).length
    },
    newAffiliates: {
      current: affiliates.filter((a) => createdIn(a, period.start, period.end)).length,
      previous: affiliates.filter((a) => createdIn(a, period.previousStart, period.previousEnd)).length
    },
    activeAffiliates: {
      current: [...clicksNow.values()].filter((n) => n > 0).length,
      previous: [...clicksBefore.values()].filter((n) => n > 0).length
    },
    all: totals(() => true),
    external: totals((id) => !isStaff(id)),
    staff: totals(isStaff),
    commissionPaidKsh: input.commissionPaidKsh,
    ranking,
    dormant: {
      count: dormant.length,
      of: activeNow.length,
      list: dormant.slice(0, DORMANT_LIST_SIZE).map(({ quietSince: _quietSince, ...row }) => row)
    },
    staffAffiliates: affiliates
      .filter((a) => staffMatches.has(a.id))
      .map((a) => ({ name: a.displayName, code: a.affiliateCode, ...staffMatches.get(a.id)! }))
  };
}

function attributed(orders: AttributedOrder[]) {
  return orders.filter((o): o is AttributedOrder & { affiliateId: string } => !!o.affiliateId);
}

function tally<T extends { affiliateId: string }>(rows: T[], pick: (row: T) => number) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.affiliateId, (map.get(row.affiliateId) ?? 0) + pick(row));
  return map;
}

function total(map: Map<string, number>, keep: (id: string) => boolean) {
  let sum = 0;
  for (const [id, value] of map) if (keep(id)) sum += value;
  return sum;
}
