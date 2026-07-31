import {
  AffiliateStatus,
  CommissionStatus,
  OrderStatus,
  prisma
} from "@online-saler/database";
import type { CustomerSession } from "../auth/customer-auth";

export type SellerRewardStatus = "Pending" | "Available" | "Paid" | "Rejected";

export type SellerDashboardData = {
  seller: {
    id: string;
    refCode: string;
    displayName: string;
    phone: string | null;
    email: string | null;
    status: "ACTIVE" | "DISABLED";
  };
  shareUrl: string;
  metrics: {
    shareActions: number;
    referralVisits: number;
    contactClicks: number;
    orderReports: number;
    rewardedOrders: number;
    pendingCommission: number;
    availableCommission: number;
    paidCommission: number;
  };
  dailyActivity: Array<{
    date: string;
    referralVisits: number;
  }>;
  topProducts: Array<{
    productCode: string;
    title: string;
    image: string;
    referralVisits: number;
    contactClicks: number;
  }>;
  orders: SellerOrder[];
  rewards: SellerReward[];
};

export type SellerOrder = {
  orderReference: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  saleAmount: number;
  commissionAmount: number;
  reportedAt: string;
  items: Array<{
    productCode: string;
    title: string;
    image: string;
    price: number;
  }>;
};

export type SellerReward = {
  id: string;
  orderReference: string;
  status: SellerRewardStatus;
  saleAmount: number;
  commissionAmount: number;
  earnedAt: string;
  note: string | null;
};

type ActiveSeller = {
  id: string;
  affiliateCode: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  status: AffiliateStatus;
};

type ProductClick = {
  source: string | null;
  product: {
    productCode: string;
    title: string | null;
    images: Array<{
      publicUrl: string | null;
      originalUrl: string;
    }>;
  } | null;
};

const sellerTrackedSources = new Set(["whatsapp", "tiktok", "facebook", "instagram"]);
const paidOrderStatuses = new Set<OrderStatus>([
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
  OrderStatus.COMPLETED
]);

export async function getActiveSellerForCustomer(customer: CustomerSession | null): Promise<ActiveSeller | null> {
  if (!customer) return null;
  const direct = await prisma.affiliate.findFirst({
    where: {
      customerId: customer.customerId,
      status: AffiliateStatus.ACTIVE
    }
  });
  if (direct) return direct;

  const byEmail = await prisma.affiliate.findFirst({
    where: {
      email: customer.email.toLowerCase(),
      status: AffiliateStatus.ACTIVE
    }
  });
  if (!byEmail) return null;
  if (!byEmail.customerId) {
    return prisma.affiliate.update({
      where: { id: byEmail.id },
      data: { customerId: customer.customerId }
    });
  }
  return byEmail;
}

export async function getSellerDashboardForCustomer(customer: CustomerSession | null): Promise<SellerDashboardData | null> {
  const seller = await getActiveSellerForCustomer(customer);
  if (!seller) return null;

  const [clicks, orders, commissions] = await Promise.all([
    prisma.affiliateClick.findMany({
      where: { affiliateId: seller.id },
      include: {
        product: {
          include: {
            images: { orderBy: { sortOrder: "asc" }, take: 1 }
          }
        }
      },
      orderBy: { clickedAt: "desc" },
      take: 500
    }),
    prisma.order.findMany({
      where: { affiliateId: seller.id },
      include: {
        customer: true,
        commission: true,
        items: {
          include: { snapshot: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.commission.findMany({
      where: { affiliateId: seller.id },
      include: { order: true },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  const pendingCommission = sumCommission(commissions.filter((row) => row.status === CommissionStatus.PENDING));
  const availableCommission = sumCommission(commissions.filter((row) => row.status === CommissionStatus.CONFIRMED));
  const paidCommission = sumCommission(commissions.filter((row) => row.status === CommissionStatus.PAID));
  const contactClicks = clicks.filter((click) => normalizeSource(click.source) === "whatsapp").length;

  return {
    seller: {
      id: seller.id,
      refCode: seller.affiliateCode,
      displayName: seller.displayName,
      phone: seller.phone,
      email: seller.email,
      status: seller.status === AffiliateStatus.ACTIVE ? "ACTIVE" : "DISABLED"
    },
    shareUrl: `/?ref=${encodeURIComponent(seller.affiliateCode)}`,
    metrics: {
      shareActions: clicks.filter((click) => sellerTrackedSources.has(normalizeSource(click.source))).length,
      referralVisits: clicks.length,
      contactClicks,
      orderReports: orders.length,
      rewardedOrders: commissions.length,
      pendingCommission,
      availableCommission,
      paidCommission
    },
    dailyActivity: buildDailyActivity(clicks.map((click) => click.clickedAt)),
    topProducts: buildTopProducts(clicks),
    orders: orders.map((order) => {
      const items = order.items.map((item) => ({
        productCode: item.snapshot?.productCode ?? item.productId,
        title: item.snapshot?.title ?? "Direct Loop item",
        image: item.snapshot?.imageUrl ?? "/og.png",
        price: item.unitPriceKsh
      }));
      return {
        orderReference: order.orderNumber,
        status: sellerOrderStatus(order.status),
        customerName: order.customer.displayName || order.customer.email,
        customerPhone: order.customer.phone,
        saleAmount: order.itemSubtotalKsh,
        commissionAmount: order.commission?.commissionAmountKsh ?? 0,
        reportedAt: order.createdAt.toISOString(),
        items
      };
    }),
    rewards: commissions.map((commission) => ({
      id: commission.id,
      orderReference: commission.order.orderNumber,
      status: sellerRewardStatus(commission.status),
      saleAmount: commission.orderSubtotalKsh,
      commissionAmount: commission.commissionAmountKsh,
      earnedAt: commission.createdAt.toISOString(),
      note: commission.note
    }))
  };
}

export function sellerHeaderAction(activeSeller: boolean): { label: string; href: string; active: boolean } {
  return activeSeller
    ? { label: "推广者中台", href: "/seller", active: true }
    : { label: "Join seller", href: "/join-seller", active: false };
}

export function sellerRewardStatus(status: CommissionStatus): SellerRewardStatus {
  if (status === CommissionStatus.CONFIRMED) return "Available";
  if (status === CommissionStatus.PAID) return "Paid";
  if (status === CommissionStatus.REJECTED) return "Rejected";
  return "Pending";
}

function sellerOrderStatus(status: OrderStatus): string {
  if (status === OrderStatus.COMPLETED) return "Completed";
  if (paidOrderStatuses.has(status)) return "Paid";
  if (status === OrderStatus.CANCELLED) return "Cancelled";
  if (status === OrderStatus.EXPIRED) return "Expired";
  if (status === OrderStatus.REFUNDED) return "Refunded";
  return "Pending";
}

function buildDailyActivity(dates: Date[]) {
  const today = startOfDay(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    return {
      date: date.toISOString(),
      referralVisits: dates.filter((value) => value >= date && value < next).length
    };
  });
}

function buildTopProducts(clicks: ProductClick[]) {
  const byProduct = new Map<string, {
    productCode: string;
    title: string;
    image: string;
    referralVisits: number;
    contactClicks: number;
  }>();

  for (const click of clicks) {
    if (!click.product) continue;
    const productCode = click.product.productCode;
    const existing = byProduct.get(productCode) ?? {
      productCode,
      title: click.product.title ?? productCode,
      image: click.product.images[0]?.publicUrl ?? click.product.images[0]?.originalUrl ?? "/og.png",
      referralVisits: 0,
      contactClicks: 0
    };
    existing.referralVisits += 1;
    if (normalizeSource(click.source) === "whatsapp") existing.contactClicks += 1;
    byProduct.set(productCode, existing);
  }

  return [...byProduct.values()]
    .sort((first, second) => second.referralVisits - first.referralVisits)
    .slice(0, 8);
}

function normalizeSource(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function sumCommission(rows: Array<{ commissionAmountKsh: number }>): number {
  return rows.reduce((total, row) => total + row.commissionAmountKsh, 0);
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
