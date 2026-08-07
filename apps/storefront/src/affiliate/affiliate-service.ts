import { createHash } from "node:crypto";
import {
  AffiliateStatus,
  CollectionStatus,
  CommissionStatus,
  OrderStatus,
  Prisma,
  prisma,
  type AffiliateClick,
  type Commission
} from "@online-saler/database";
import { createAttributionExpiry } from "@online-saler/business-rules";

export const AFFILIATE_ATTRIBUTION_COOKIE = "direct_loop_affiliate";
export const AFFILIATE_DEFAULT_RATE_SETTING_KEY = "affiliate.defaultCommissionRateBps";

type TrackAffiliateClickInput = {
  affiliateCode?: string | null;
  productCode?: string | null;
  collectionSlug?: string | null;
  customerId?: string | null;
  sessionId?: string | null;
  source?: string | null;
  placement?: string | null;
  campaign?: string | null;
  landingPath?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  clickedAt?: Date;
};

export type AffiliateCookiePayload = {
  affiliateCode: string;
  clickId?: string;
  source?: string;
  placement?: string;
  campaign?: string;
  expiresAt: string;
};

export type CheckoutAttributionInput = {
  affiliateCode?: string | null;
  affiliateClickId?: string | null;
  source?: string | null;
  placement?: string | null;
  campaign?: string | null;
};

export type ResolvedCheckoutAttribution = {
  affiliateId: string;
  affiliateClickId: string | null;
  source: string | null;
  placement: string | null;
  campaign: string | null;
  expiresAt: Date;
};

export function normalizeAffiliateCode(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return normalized?.slice(0, 40) || null;
}

export function normalizeCampaignValue(value?: string | null): string | null {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9_.:-]/g, "");
  return normalized?.slice(0, 80) || null;
}

export function normalizeSourceValue(value?: string | null): string | null {
  return normalizeCampaignValue(value)?.toLowerCase() ?? null;
}

export function landingPathForProduct(productCode?: string | null): string {
  const cleanCode = productCode?.trim();
  return cleanCode ? `/p/${encodeURIComponent(cleanCode)}` : "/";
}

export function encodeAffiliateCookie(payload: AffiliateCookiePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function parseAffiliateCookie(value?: string | null): AffiliateCookiePayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AffiliateCookiePayload;
    const affiliateCode = normalizeAffiliateCode(parsed.affiliateCode);
    if (!affiliateCode || !parsed.expiresAt || new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return {
      affiliateCode,
      clickId: typeof parsed.clickId === "string" ? parsed.clickId : undefined,
      source: normalizeSourceValue(parsed.source) ?? undefined,
      placement: normalizeCampaignValue(parsed.placement) ?? undefined,
      campaign: normalizeCampaignValue(parsed.campaign) ?? undefined,
      expiresAt: parsed.expiresAt
    };
  } catch {
    return null;
  }
}

export async function recordAffiliateClick(input: TrackAffiliateClickInput) {
  const affiliateCode = normalizeAffiliateCode(input.affiliateCode);
  if (!affiliateCode) return null;

  const clickedAt = input.clickedAt ?? new Date();
  const expiresAt = createAttributionExpiry(clickedAt);
  const source = normalizeSourceValue(input.source);
  const placement = normalizeCampaignValue(input.placement);
  const campaign = normalizeCampaignValue(input.campaign);
  const landingPath = input.landingPath?.trim().slice(0, 240) || landingPathForProduct(input.productCode);

  const affiliate = await prisma.affiliate.findFirst({
    where: {
      affiliateCode,
      status: AffiliateStatus.ACTIVE
    }
  });
  if (!affiliate) return null;

  const product = input.productCode
    ? await prisma.product.findUnique({ where: { productCode: input.productCode.trim() } })
    : null;
  const collection = input.collectionSlug
    ? await prisma.collection.findFirst({
        where: {
          slug: input.collectionSlug.trim(),
          affiliateId: affiliate.id,
          status: CollectionStatus.PUBLISHED
        }
      })
    : null;

  const affiliateLink = await prisma.affiliateLink.findFirst({
    where: {
      affiliateId: affiliate.id,
      active: true,
      ...(product
        ? { productId: product.id }
        : collection
          ? { collectionId: collection.id }
          : { type: "STORE" }),
      ...(source ? { source } : {}),
      ...(placement ? { placement } : {}),
      ...(campaign ? { campaign } : {})
    },
    orderBy: { createdAt: "desc" }
  });

  const click = await prisma.affiliateClick.create({
    data: {
      affiliateId: affiliate.id,
      affiliateLinkId: affiliateLink?.id ?? null,
      productId: product?.id ?? null,
      collectionId: collection?.id ?? null,
      customerId: input.customerId ?? null,
      sessionId: input.sessionId?.trim().slice(0, 120) || null,
      source,
      placement,
      campaign,
      landingPath,
      referrer: input.referrer?.trim().slice(0, 500) || null,
      userAgent: input.userAgent?.trim().slice(0, 500) || null,
      ipHash: input.ipAddress ? hashIp(input.ipAddress) : null,
      clickedAt,
      expiresAt
    }
  });

  return {
    affiliateCode,
    clickId: click.id,
    expiresAt: expiresAt.toISOString(),
    source: source ?? undefined,
    placement: placement ?? undefined,
    campaign: campaign ?? undefined
  } satisfies AffiliateCookiePayload;
}

export async function resolveCheckoutAttribution(
  tx: Prisma.TransactionClient,
  customerId: string,
  input: CheckoutAttributionInput | null | undefined,
  now = new Date()
): Promise<ResolvedCheckoutAttribution | null> {
  const affiliateCode = normalizeAffiliateCode(input?.affiliateCode);
  const affiliateClickId = input?.affiliateClickId?.trim() || null;
  if (!affiliateCode && !affiliateClickId) return null;

  if (affiliateClickId) {
    const click = await tx.affiliateClick.findFirst({
      where: {
        id: affiliateClickId,
        expiresAt: { gt: now },
        affiliate: { status: AffiliateStatus.ACTIVE }
      },
      include: { affiliate: true }
    });
    if (click && (!affiliateCode || click.affiliate.affiliateCode === affiliateCode)) {
      if (!click.customerId) {
        await tx.affiliateClick.update({
          where: { id: click.id },
          data: { customerId }
        });
      }
      return {
        affiliateId: click.affiliateId,
        affiliateClickId: click.id,
        source: normalizeSourceValue(input?.source) ?? click.source,
        placement: normalizeCampaignValue(input?.placement) ?? click.placement,
        campaign: normalizeCampaignValue(input?.campaign) ?? click.campaign,
        expiresAt: click.expiresAt
      };
    }
  }

  if (!affiliateCode) return null;
  const affiliate = await tx.affiliate.findFirst({
    where: {
      affiliateCode,
      status: AffiliateStatus.ACTIVE
    }
  });
  if (!affiliate) return null;

  return {
    affiliateId: affiliate.id,
    affiliateClickId: null,
    source: normalizeSourceValue(input?.source),
    placement: normalizeCampaignValue(input?.placement),
    campaign: normalizeCampaignValue(input?.campaign),
    expiresAt: createAttributionExpiry(now)
  };
}

export async function createAttributionForOrder(
  tx: Prisma.TransactionClient,
  input: ResolvedCheckoutAttribution & {
    customerId: string;
    orderId: string;
  }
) {
  return tx.affiliateAttribution.create({
    data: {
      affiliateId: input.affiliateId,
      affiliateClickId: input.affiliateClickId,
      customerId: input.customerId,
      orderId: input.orderId,
      source: input.source,
      placement: input.placement,
      campaign: input.campaign,
      expiresAt: input.expiresAt
    }
  });
}

export async function createPendingCommissionForPaidOrder(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<Commission | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      affiliate: true,
      affiliateAttribution: true,
      commission: true
    }
  });

  if (!order?.affiliateId || !order.affiliate || order.status !== OrderStatus.PAID) return null;
  if (order.commission) return order.commission;

  const rateBps = order.affiliate.commissionRateBps ?? await getDefaultCommissionRateBps(tx);
  const commissionAmountKsh = calculateCommissionKsh(order.itemSubtotalKsh, rateBps);

  return tx.commission.create({
    data: {
      affiliateId: order.affiliateId,
      orderId: order.id,
      attributionId: order.affiliateAttribution?.id ?? null,
      status: CommissionStatus.PENDING,
      rateBps,
      orderSubtotalKsh: order.itemSubtotalKsh,
      commissionAmountKsh
    }
  });
}

export async function handleCommissionForCancelledOrRefundedOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  reason: "ORDER_CANCELLED" | "ORDER_REFUNDED"
) {
  const commission = await tx.commission.findUnique({ where: { orderId } });
  if (!commission || commission.status === CommissionStatus.PAID || commission.status === CommissionStatus.REJECTED) {
    return commission;
  }
  if (commission.status === CommissionStatus.PENDING) {
    return tx.commission.update({
      where: { id: commission.id },
      data: {
        status: CommissionStatus.REJECTED,
        rejectedAt: new Date(),
        holdReason: reason,
        note: reason === "ORDER_CANCELLED" ? "Order was cancelled before commission confirmation." : "Order was refunded before commission confirmation."
      }
    });
  }
  return tx.commission.update({
    where: { id: commission.id },
    data: {
      holdReason: reason,
      note: reason === "ORDER_CANCELLED" ? "Confirmed commission is frozen because the order was cancelled." : "Confirmed commission is frozen because the order was refunded."
    }
  });
}

export function canPayCommission(commission: Pick<Commission, "status" | "holdReason">): boolean {
  return commission.status === CommissionStatus.CONFIRMED && !commission.holdReason;
}

export function calculateCommissionKsh(orderSubtotalKsh: number, rateBps: number): number {
  if (!Number.isFinite(orderSubtotalKsh) || orderSubtotalKsh < 0) return 0;
  if (!Number.isFinite(rateBps) || rateBps < 0) return 0;
  return Math.round((orderSubtotalKsh * rateBps) / 10000);
}

async function getDefaultCommissionRateBps(tx: Prisma.TransactionClient): Promise<number> {
  const setting = await tx.systemSetting.findUnique({ where: { key: AFFILIATE_DEFAULT_RATE_SETTING_KEY } });
  const value = setting?.valueJson;
  if (typeof value === "number" && Number.isFinite(value)) return clampRate(value);
  if (typeof value === "string" && value.trim()) return clampRate(Number(value));
  return 1000;
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 1000;
  return Math.max(0, Math.min(5000, Math.round(value)));
}

function hashIp(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
