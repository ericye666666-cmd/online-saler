import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AffiliateLinkType,
  AffiliateStatus,
  CommissionStatus,
  OrderStatus,
  prisma
} from "@online-saler/database";
import { randomBytes } from "node:crypto";
import { OperationsAccessService } from "./operations-access.service";

const AFFILIATE_VIEW = "action.affiliate.view";
const AFFILIATE_EDIT = "action.affiliate.edit";
const AFFILIATE_APPROVE = "action.affiliate.approve";
const AFFILIATE_EXPORT = "action.affiliate.export";
const DEFAULT_COMMISSION_SETTING_KEY = "affiliate.defaultCommissionRateBps";

export type CommissionQueueKey = "pending" | "confirmed" | "paid" | "exceptions";

type AffiliateInput = {
  adminUserId?: string;
  customerId?: string;
  affiliateCode?: string;
  displayName?: string;
  phone?: string;
  email?: string;
  commissionRateBps?: number;
};

type AffiliateUpdateInput = {
  adminUserId?: string;
  status?: AffiliateStatus;
  commissionRateBps?: number | null;
};

type LinkInput = {
  adminUserId?: string;
  affiliateId?: string;
  affiliateCode?: string;
  type?: AffiliateLinkType;
  productId?: string;
  productCode?: string;
  collectionId?: string;
  source?: string;
  placement?: string;
  campaign?: string;
  landingPath?: string;
};

type CommissionActionInput = {
  adminUserId?: string;
  note?: string;
};

@Injectable()
export class OperationsAffiliateService {
  constructor(private readonly access: OperationsAccessService) {}

  async summary(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, AFFILIATE_VIEW);
    const [
      activeAffiliates,
      disabledAffiliates,
      clicks,
      attributedOrders,
      paidOrders,
      pendingCommissions,
      confirmedCommissions,
      paidCommissions,
      sales,
      commissions
    ] = await Promise.all([
      prisma.affiliate.count({ where: { status: AffiliateStatus.ACTIVE } }),
      prisma.affiliate.count({ where: { status: AffiliateStatus.DISABLED } }),
      prisma.affiliateClick.count(),
      prisma.order.count({ where: { affiliateId: { not: null } } }),
      prisma.order.count({ where: { affiliateId: { not: null }, status: { in: [OrderStatus.PAID, OrderStatus.FULFILLING, OrderStatus.COMPLETED] } } }),
      prisma.commission.count({ where: { status: CommissionStatus.PENDING } }),
      prisma.commission.count({ where: { status: CommissionStatus.CONFIRMED } }),
      prisma.commission.count({ where: { status: CommissionStatus.PAID } }),
      prisma.order.aggregate({
        where: { affiliateId: { not: null }, status: { in: [OrderStatus.PAID, OrderStatus.FULFILLING, OrderStatus.COMPLETED] } },
        _sum: { itemSubtotalKsh: true }
      }),
      prisma.commission.aggregate({
        _sum: {
          commissionAmountKsh: true
        }
      })
    ]);

    return {
      activeAffiliates,
      disabledAffiliates,
      clicks,
      attributedOrders,
      paidOrders,
      pendingCommissions,
      confirmedCommissions,
      paidCommissions,
      attributedSalesKsh: sales._sum.itemSubtotalKsh ?? 0,
      totalCommissionKsh: commissions._sum.commissionAmountKsh ?? 0
    };
  }

  async listAffiliates(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, AFFILIATE_VIEW);
    const affiliates = await prisma.affiliate.findMany({
      include: {
        _count: {
          select: {
            clicks: true,
            orders: true,
            commissions: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200
    });
    return affiliates.map((affiliate) => ({
      ...affiliate,
      storefrontShareUrl: buildShareUrl("/", affiliate.affiliateCode)
    }));
  }

  async createAffiliate(input: AffiliateInput) {
    await this.access.requirePermission(input.adminUserId, AFFILIATE_EDIT);
    const linkedCustomer = input.customerId
      ? await prisma.customer.findUnique({ where: { id: input.customerId } })
      : null;
    if (input.customerId && !linkedCustomer) throw new NotFoundException("Customer account was not found.");
    const displayName = input.displayName?.trim() || linkedCustomer?.displayName || linkedCustomer?.email;
    if (!displayName) throw new BadRequestException("Affiliate display name is required.");
    const affiliateCode = normalizeAffiliateCode(input.affiliateCode) ?? await uniqueAffiliateCode(displayName);
    const commissionRateBps = normalizeOptionalRate(input.commissionRateBps);

    return prisma.affiliate.create({
      data: {
        customerId: linkedCustomer?.id ?? null,
        affiliateCode,
        slug: affiliateSlug(displayName, affiliateCode),
        displayName,
        phone: cleanOptional(input.phone) ?? linkedCustomer?.phone ?? null,
        email: cleanOptional(input.email)?.toLowerCase() ?? linkedCustomer?.email.toLowerCase() ?? null,
        commissionRateBps
      }
    });
  }

  async searchCustomers(adminUserId: string | undefined, query: string | undefined) {
    await this.access.requirePermission(adminUserId, AFFILIATE_VIEW);
    const term = query?.trim();
    if (!term || term.length < 2) return [];
    return prisma.customer.findMany({
      where: {
        OR: [
          { email: { contains: term, mode: "insensitive" } },
          { normalizedEmail: { contains: term.toLowerCase(), mode: "insensitive" } },
          { displayName: { contains: term, mode: "insensitive" } },
          { phone: { contains: term } }
        ]
      },
      include: {
        affiliateProfile: true,
        _count: { select: { orders: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 20
    });
  }

  async enableCustomerAffiliate(customerId: string, input: AffiliateInput) {
    await this.access.requirePermission(input.adminUserId, AFFILIATE_EDIT);
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { affiliateProfile: true }
    });
    if (!customer) throw new NotFoundException("Customer account was not found.");
    const displayName = input.displayName?.trim() || customer.displayName || customer.email;
    const commissionRateBps = normalizeOptionalRate(input.commissionRateBps);
    const existing = customer.affiliateProfile ?? await prisma.affiliate.findFirst({
      where: { email: customer.email.toLowerCase() }
    });

    if (existing) {
      return prisma.affiliate.update({
        where: { id: existing.id },
        data: {
          customerId: customer.id,
          displayName,
          phone: cleanOptional(input.phone) ?? customer.phone ?? existing.phone,
          email: customer.email.toLowerCase(),
          commissionRateBps: input.commissionRateBps === undefined ? existing.commissionRateBps : commissionRateBps,
          status: AffiliateStatus.ACTIVE,
          disabledAt: null
        }
      });
    }

    const affiliateCode = normalizeAffiliateCode(input.affiliateCode) ?? await uniqueAffiliateCode(displayName);
    return prisma.affiliate.create({
      data: {
        customerId: customer.id,
        affiliateCode,
        slug: affiliateSlug(displayName, affiliateCode),
        displayName,
        phone: cleanOptional(input.phone) ?? customer.phone ?? null,
        email: customer.email.toLowerCase(),
        commissionRateBps,
        status: AffiliateStatus.ACTIVE
      }
    });
  }

  async updateAffiliate(affiliateId: string, input: AffiliateUpdateInput) {
    await this.access.requirePermission(input.adminUserId, AFFILIATE_EDIT);
    const data: Record<string, unknown> = {};
    if (input.status) {
      data.status = input.status;
      data.disabledAt = input.status === AffiliateStatus.DISABLED ? new Date() : null;
    }
    if (Object.prototype.hasOwnProperty.call(input, "commissionRateBps")) {
      data.commissionRateBps = normalizeOptionalRate(input.commissionRateBps);
    }
    if (Object.keys(data).length === 0) throw new BadRequestException("No affiliate changes were provided.");
    return prisma.affiliate.update({ where: { id: affiliateId }, data });
  }

  async listLinks(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, AFFILIATE_VIEW);
    const links = await prisma.affiliateLink.findMany({
      include: {
        affiliate: true,
        product: true,
        _count: { select: { clicks: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return links.map((link) => ({
      ...link,
      shareUrl: buildShareUrl(link.landingPath, link.affiliate.affiliateCode, link.source, link.campaign, link.placement),
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(buildShareUrl(link.landingPath, link.affiliate.affiliateCode, "whatsapp", link.campaign, link.placement ?? "direct-message"))}`
    }));
  }

  async createLink(input: LinkInput) {
    await this.access.requirePermission(input.adminUserId, AFFILIATE_EDIT);
    const affiliate = await this.findAffiliate(input);
    const type = input.type ?? (
      input.productId || input.productCode
        ? AffiliateLinkType.PRODUCT
        : input.collectionId
          ? AffiliateLinkType.COLLECTION
          : AffiliateLinkType.STORE
    );
    const product = input.productId
      ? await prisma.product.findUnique({ where: { id: input.productId } })
      : input.productCode
        ? await prisma.product.findUnique({ where: { productCode: input.productCode.trim() } })
        : null;
    if (type === AffiliateLinkType.PRODUCT && !product) throw new BadRequestException("Product link requires a valid product.");
    const collection = input.collectionId
      ? await prisma.collection.findFirst({ where: { id: input.collectionId, affiliateId: affiliate.id } })
      : null;
    if (type === AffiliateLinkType.COLLECTION && !collection) {
      throw new BadRequestException("Collection link requires a valid Affiliate Collection.");
    }
    const landingPath = cleanOptional(input.landingPath)
      ?? (product ? `/p/${product.productCode}` : collection ? `/c/${collection.slug}` : "/");
    return prisma.affiliateLink.create({
      data: {
        affiliateId: affiliate.id,
        linkCode: await uniqueLinkCode(affiliate.affiliateCode),
        type,
        productId: product?.id ?? null,
        collectionId: collection?.id ?? null,
        landingPath,
        source: normalizeSource(input.source) ?? "direct",
        placement: normalizeCampaign(input.placement) ?? "share",
        campaign: normalizeCampaign(input.campaign) ?? "organic"
      },
      include: {
        affiliate: true,
        product: true,
        collection: true
      }
    });
  }

  async listClicks(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, AFFILIATE_VIEW);
    return prisma.affiliateClick.findMany({
      include: {
        affiliate: true,
        affiliateLink: true,
        product: true,
        customer: true
      },
      orderBy: { clickedAt: "desc" },
      take: 200
    });
  }

  async listAttributedOrders(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, AFFILIATE_VIEW);
    return prisma.order.findMany({
      where: { affiliateId: { not: null } },
      include: {
        affiliate: true,
        customer: true,
        commission: true,
        items: { include: { snapshot: true } },
        payments: { orderBy: { requestedAt: "desc" }, take: 1 }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async listCommissions(queue: CommissionQueueKey | undefined, adminUserId?: string) {
    await this.access.requirePermission(adminUserId, AFFILIATE_VIEW);
    return prisma.commission.findMany({
      where: commissionWhere(queue),
      include: {
        affiliate: true,
        order: {
          include: {
            customer: true,
            items: { include: { snapshot: true } }
          }
        },
        attribution: true
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async confirmCommission(commissionId: string, input: CommissionActionInput) {
    await this.access.requirePermission(input.adminUserId, AFFILIATE_APPROVE);
    return prisma.commission.update({
      where: { id: commissionId },
      data: {
        status: CommissionStatus.CONFIRMED,
        confirmedAt: new Date(),
        holdReason: null,
        note: cleanOptional(input.note)
      }
    });
  }

  async rejectCommission(commissionId: string, input: CommissionActionInput) {
    await this.access.requirePermission(input.adminUserId, AFFILIATE_APPROVE);
    return prisma.commission.update({
      where: { id: commissionId },
      data: {
        status: CommissionStatus.REJECTED,
        rejectedAt: new Date(),
        holdReason: "MANUAL_REJECTED",
        note: cleanOptional(input.note) ?? "Rejected by affiliate operations."
      }
    });
  }

  async markCommissionPaid(commissionId: string, input: CommissionActionInput) {
    await this.access.requirePermission(input.adminUserId, AFFILIATE_APPROVE);
    const commission = await prisma.commission.findUnique({ where: { id: commissionId } });
    if (!commission) throw new NotFoundException("Commission was not found.");
    if (commission.status !== CommissionStatus.CONFIRMED || commission.holdReason) {
      throw new BadRequestException("Only confirmed commissions without a hold can be marked as paid.");
    }
    return prisma.commission.update({
      where: { id: commissionId },
      data: {
        status: CommissionStatus.PAID,
        paidAt: new Date(),
        note: cleanOptional(input.note) ?? commission.note
      }
    });
  }

  async payoutExport(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, AFFILIATE_EXPORT);
    const commissions = await prisma.commission.findMany({
      where: { status: CommissionStatus.CONFIRMED, holdReason: null },
      include: {
        affiliate: true,
        order: true
      },
      orderBy: { createdAt: "asc" }
    });
    return commissions.map((commission) => ({
      commissionId: commission.id,
      affiliateCode: commission.affiliate.affiliateCode,
      affiliateName: commission.affiliate.displayName,
      phone: commission.affiliate.phone,
      orderNumber: commission.order.orderNumber,
      orderSubtotalKsh: commission.orderSubtotalKsh,
      rateBps: commission.rateBps,
      commissionAmountKsh: commission.commissionAmountKsh
    }));
  }

  async commissionSetting(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, AFFILIATE_VIEW);
    const setting = await prisma.systemSetting.findUnique({ where: { key: DEFAULT_COMMISSION_SETTING_KEY } });
    return {
      key: DEFAULT_COMMISSION_SETTING_KEY,
      valueBps: typeof setting?.valueJson === "number" ? setting.valueJson : 1000
    };
  }

  private async findAffiliate(input: LinkInput) {
    const affiliate = input.affiliateId
      ? await prisma.affiliate.findUnique({ where: { id: input.affiliateId } })
      : input.affiliateCode
        ? await prisma.affiliate.findUnique({ where: { affiliateCode: normalizeAffiliateCode(input.affiliateCode) ?? "" } })
        : null;
    if (!affiliate || affiliate.status !== AffiliateStatus.ACTIVE) {
      throw new BadRequestException("Active affiliate is required.");
    }
    return affiliate;
  }
}

function commissionWhere(queue?: CommissionQueueKey) {
  if (queue === "pending") return { status: CommissionStatus.PENDING };
  if (queue === "confirmed") return { status: CommissionStatus.CONFIRMED, holdReason: null };
  if (queue === "paid") return { status: CommissionStatus.PAID };
  if (queue === "exceptions") {
    return {
      OR: [
        { status: CommissionStatus.REJECTED },
        { holdReason: { not: null } }
      ]
    };
  }
  return {};
}

function normalizeAffiliateCode(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return normalized?.slice(0, 40) || null;
}

function cleanOptional(value?: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 200) : null;
}

function normalizeSource(value?: string | null): string | null {
  return normalizeCampaign(value)?.toLowerCase() ?? null;
}

function normalizeCampaign(value?: string | null): string | null {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9_.:-]/g, "");
  return normalized?.slice(0, 80) || null;
}

function normalizeOptionalRate(value?: number | null): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 5000) {
    throw new BadRequestException("Commission rate must be between 0 and 5000 basis points.");
  }
  return Math.round(value);
}

async function uniqueAffiliateCode(displayName: string): Promise<string> {
  const base = normalizeAffiliateCode(displayName.replace(/\s+/g, "-")) ?? "AFF";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${base.slice(0, 24)}-${randomBytes(2).toString("hex").toUpperCase()}`;
    const existing = await prisma.affiliate.findUnique({ where: { affiliateCode: code } });
    if (!existing) return code;
  }
  throw new BadRequestException("Could not generate a unique affiliate code.");
}

async function uniqueLinkCode(affiliateCode: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${affiliateCode}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await prisma.affiliateLink.findUnique({ where: { linkCode: code } });
    if (!existing) return code;
  }
  throw new BadRequestException("Could not generate a unique affiliate link code.");
}

function affiliateSlug(displayName: string, affiliateCode: string): string {
  const name = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "affiliate";
  const code = affiliateCode.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${name}-${code}`;
}

function buildShareUrl(
  path: string,
  affiliateCode: string,
  source?: string | null,
  campaign?: string | null,
  placement?: string | null
): string {
  const base = process.env.STOREFRONT_PUBLIC_URL ?? "http://localhost:3000";
  const url = new URL(path || "/", base);
  url.searchParams.set("ref", affiliateCode);
  url.searchParams.set("source", source || "direct");
  url.searchParams.set("placement", placement || "share");
  url.searchParams.set("campaign", campaign || "organic");
  return url.toString();
}
