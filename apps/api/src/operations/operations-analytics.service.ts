import { Injectable } from "@nestjs/common";
import {
  CheckoutDraftStatus,
  CommissionStatus,
  CustomerServiceCaseStatus,
  FulfillmentMethod,
  FulfillmentStatus,
  InventoryItemStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  prisma
} from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";

const ANALYTICS_VIEW = "action.analytics.view";

export type AnalyticsFilters = {
  adminUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  employeeId?: string;
  affiliateId?: string;
  fulfillmentMethod?: FulfillmentMethod;
};

type MetricStatus = "AVAILABLE" | "NO_SOURCE";

export type AnalyticsMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: "count" | "percent" | "hours" | "ksh";
  status: MetricStatus;
  definition: string;
  source: string;
  note?: string;
};

@Injectable()
export class OperationsAnalyticsService {
  constructor(private readonly access: OperationsAccessService) {}

  async dashboard(filters: AnalyticsFilters) {
    await this.access.requirePermission(filters.adminUserId, ANALYTICS_VIEW);
    const dateRange = parseDateRange(filters);
    const productWhere = productWhereFromFilters(filters, dateRange);
    const orderWhere = orderWhereFromFilters(filters, dateRange);
    const paymentWhere = paymentWhereFromFilters(filters, dateRange);
    const draftWhere = checkoutDraftWhereFromFilters(filters, dateRange);
    const inventoryWhere = inventoryWhereFromFilters(filters);

    const [
      createdProducts,
      publishedProducts,
      paymentAttempts,
      paymentSuccess,
      checkoutDrafts,
      expiredDrafts,
      stockedItems,
      soldItems,
      paidOrders,
      affiliatePaidOrders,
      pickupOrders,
      deliveryOrders,
      categoryPerformance,
      affiliatePerformance,
      employeeEfficiency,
      returnsAndExceptions,
      averageSoldHours
    ] = await Promise.all([
      prisma.product.count({ where: productWhere }),
      prisma.product.count({ where: { ...productWhere, status: ProductStatus.PUBLISHED } }),
      prisma.payment.count({ where: paymentWhere }),
      prisma.payment.count({ where: { ...paymentWhere, status: PaymentStatus.SUCCESS } }),
      prisma.checkoutDraft.count({ where: draftWhere }),
      prisma.checkoutDraft.count({ where: { ...draftWhere, status: CheckoutDraftStatus.EXPIRED } }),
      prisma.inventoryItem.count({ where: inventoryWhere }),
      prisma.inventoryItem.count({ where: { ...inventoryWhere, status: { in: soldInventoryStatuses } } }),
      prisma.order.count({ where: { ...orderWhere, status: { in: paidOrderStatuses } } }),
      prisma.order.count({ where: { ...orderWhere, status: { in: paidOrderStatuses }, affiliateId: { not: null } } }),
      prisma.order.count({ where: { ...orderWhere, status: { in: paidOrderStatuses }, fulfillmentMethod: FulfillmentMethod.PICKUP } }),
      prisma.order.count({ where: { ...orderWhere, status: { in: paidOrderStatuses }, fulfillmentMethod: FulfillmentMethod.KIKUYU_LOCAL_DELIVERY } }),
      this.categoryPerformance(filters, dateRange),
      this.affiliatePerformance(filters, dateRange),
      this.employeeEfficiency(filters, dateRange),
      this.returnsAndExceptions(filters, dateRange),
      this.averageSoldHours(filters, dateRange)
    ]);

    return {
      generatedAt: new Date().toISOString(),
      filters: normalizedFilters(filters),
      metrics: [
        metric("publishedProducts", "上架商品数", publishedProducts, "count", "Product.status = PUBLISHED", "Product"),
        metric("publishSuccessRate", "发布成功率", ratio(publishedProducts, createdProducts), "percent", "PUBLISHED 商品数 / 创建商品数", "Product"),
        noSourceMetric("productViews", "商品浏览量", "当前没有全量商品浏览事件表，不能用 Affiliate 点击代替浏览量。"),
        noSourceMetric("addToCartRate", "加购率", "购物车目前保存在浏览器本地，没有服务端加购事件。"),
        noSourceMetric("checkoutRate", "Checkout 率", `当前有 ${checkoutDrafts} 个 CheckoutDraft，但缺少商品浏览或会话分母。`),
        metric("paymentSuccessRate", "支付成功率", ratio(paymentSuccess, paymentAttempts), "percent", "Payment.SUCCESS / 所有支付尝试", "Payment"),
        metric("reservationExpiryRate", "15分钟过期率", ratio(expiredDrafts, checkoutDrafts), "percent", "CheckoutDraft.EXPIRED / 所有 CheckoutDraft", "CheckoutDraft"),
        metric("selloutRate", "售罄率", ratio(soldItems, stockedItems), "percent", "已付款、拣货、打包或交付库存 / 总库存", "InventoryItem"),
        metric("averageSoldHours", "平均售出时间", averageSoldHours, "hours", "支付完成时间 - 商品发布时间", "Product + Payment"),
        metric("pickupRatio", "自提比例", ratio(pickupOrders, paidOrders), "percent", "已付款订单中自提订单占比", "Order"),
        metric("deliveryRatio", "配送比例", ratio(deliveryOrders, paidOrders), "percent", "已付款订单中配送订单占比", "Order"),
        metric("affiliateOrderShare", "佣金订单占比", ratio(affiliatePaidOrders, paidOrders), "percent", "带 Affiliate 的已付款订单 / 已付款订单", "Order + Commission")
      ] satisfies AnalyticsMetric[],
      tables: {
        categoryPerformance,
        affiliatePerformance,
        returnsAndExceptions,
        employeeEfficiency
      },
      noDataNotes: [
        "商品浏览量、加购率、完整 Checkout 率需要新增服务端埋点后才能真实计算。",
        "退货当前只有 REFUNDED 订单状态，尚未建立完整 Return Case 流程。"
      ]
    };
  }

  private async categoryPerformance(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined) {
    const categories = await prisma.product.groupBy({
      by: ["category"],
      where: productWhereFromFilters(filters, dateRange),
      _count: { _all: true }
    });
    const rows = [];
    for (const row of categories.sort((left, right) => right._count._all - left._count._all).slice(0, 20)) {
      const categoryFilter = row.category ?? undefined;
      const published = await prisma.product.count({
        where: { ...productWhereFromFilters({ ...filters, category: categoryFilter }, dateRange), status: ProductStatus.PUBLISHED }
      });
      const paidOrders = await prisma.order.count({
        where: {
          ...orderWhereFromFilters(filters, dateRange),
          status: { in: paidOrderStatuses },
          items: { some: { snapshot: { is: { category: row.category } } } }
        }
      });
      rows.push({
        category: row.category ?? "未分类",
        createdProducts: row._count._all,
        publishedProducts: published,
        paidOrders
      });
    }
    return rows;
  }

  private async affiliatePerformance(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined) {
    const affiliates = await prisma.affiliate.findMany({
      where: filters.affiliateId ? { id: filters.affiliateId } : {},
      include: {
        _count: {
          select: {
            clicks: true,
            orders: true,
            commissions: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    const rows = [];
    for (const affiliate of affiliates) {
      const orders = await prisma.order.aggregate({
        where: {
          ...orderWhereFromFilters({ ...filters, affiliateId: affiliate.id }, dateRange),
          status: { in: paidOrderStatuses }
        },
        _count: { _all: true },
        _sum: { itemSubtotalKsh: true }
      });
      const commissions = await prisma.commission.aggregate({
        where: {
          affiliateId: affiliate.id,
          createdAt: dateRange
        },
        _sum: { commissionAmountKsh: true },
        _count: { _all: true }
      });
      rows.push({
        affiliateId: affiliate.id,
        affiliateCode: affiliate.affiliateCode,
        displayName: affiliate.displayName,
        clicks: affiliate._count.clicks,
        paidOrders: orders._count._all,
        attributedSalesKsh: orders._sum.itemSubtotalKsh ?? 0,
        commissions: commissions._count._all,
        commissionAmountKsh: commissions._sum.commissionAmountKsh ?? 0
      });
    }
    return rows;
  }

  private async returnsAndExceptions(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined) {
    const orderWhere = orderWhereFromFilters(filters, dateRange);
    const [refunded, cancelled, paymentExceptions, fulfillmentExceptions, rejectedCommissions, openServiceCases] = await Promise.all([
      prisma.order.count({ where: { ...orderWhere, status: OrderStatus.REFUNDED } }),
      prisma.order.count({ where: { ...orderWhere, status: OrderStatus.CANCELLED } }),
      prisma.payment.count({
        where: {
          ...paymentWhereFromFilters(filters, dateRange),
          status: { in: [PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.TIMEOUT, PaymentStatus.MANUAL_REVIEW] }
        }
      }),
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.EXCEPTION, updatedAt: dateRange } }),
      prisma.commission.count({ where: { status: CommissionStatus.REJECTED, createdAt: dateRange } }),
      prisma.customerServiceCase.count({
        where: { status: { in: [CustomerServiceCaseStatus.OPEN, CustomerServiceCaseStatus.IN_PROGRESS] }, createdAt: dateRange }
      })
    ]);
    return { refunded, cancelled, paymentExceptions, fulfillmentExceptions, rejectedCommissions, openServiceCases };
  }

  private async employeeEfficiency(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined) {
    const employees = await prisma.employee.findMany({
      where: filters.employeeId ? { id: filters.employeeId } : {},
      orderBy: { name: "asc" },
      take: 100
    });
    const rows = [];
    for (const employee of employees) {
      const [createdProducts, reviewedProducts, fulfillmentActions] = await Promise.all([
        prisma.product.count({ where: { ...productWhereFromFilters(filters, dateRange), createdByEmployeeId: employee.id } }),
        prisma.productReview.count({ where: { ...reviewWhereFromFilters(filters, dateRange), reviewerEmployeeId: employee.id } }),
        prisma.fulfillmentEvent.count({ where: { actorEmployeeId: employee.id, createdAt: dateRange } })
      ]);
      if (createdProducts || reviewedProducts || fulfillmentActions) {
        rows.push({
          employeeId: employee.id,
          name: employee.name,
          createdProducts,
          reviewedProducts,
          fulfillmentActions
        });
      }
    }
    return rows;
  }

  private async averageSoldHours(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined): Promise<number | null> {
    const orders = await prisma.order.findMany({
      where: {
        ...orderWhereFromFilters(filters, dateRange),
        status: { in: paidOrderStatuses }
      },
      include: {
        payments: { where: { status: PaymentStatus.SUCCESS }, orderBy: { completedAt: "asc" }, take: 1 },
        items: true
      },
      take: 500
    });
    const productIds = [...new Set(orders.flatMap((order) => order.items.map((item) => item.productId)))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, publishedAt: { not: null } },
      select: { id: true, publishedAt: true }
    });
    const publishedAt = new Map(products.map((product) => [product.id, product.publishedAt]));
    const durations = [];
    for (const order of orders) {
      const completedAt = order.payments[0]?.completedAt ?? order.updatedAt;
      for (const item of order.items) {
        const published = publishedAt.get(item.productId);
        if (published && completedAt > published) {
          durations.push((completedAt.getTime() - published.getTime()) / 36e5);
        }
      }
    }
    if (durations.length === 0) return null;
    return Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10;
  }
}

const paidOrderStatuses: OrderStatus[] = [OrderStatus.PAID, OrderStatus.FULFILLING, OrderStatus.COMPLETED];
const soldInventoryStatuses: InventoryItemStatus[] = [
  InventoryItemStatus.PAID,
  InventoryItemStatus.PICKED,
  InventoryItemStatus.PACKED,
  InventoryItemStatus.DELIVERED
];

function parseDateRange(filters: AnalyticsFilters): Prisma.DateTimeFilter | undefined {
  const gte = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
  const lte = filters.dateTo ? new Date(filters.dateTo) : undefined;
  if (!gte && !lte) return undefined;
  return {
    ...(gte && !Number.isNaN(gte.getTime()) ? { gte } : {}),
    ...(lte && !Number.isNaN(lte.getTime()) ? { lte } : {})
  };
}

function productWhereFromFilters(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined): Prisma.ProductWhereInput {
  return {
    ...(dateRange ? { createdAt: dateRange } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.employeeId ? { createdByEmployeeId: filters.employeeId } : {})
  };
}

function reviewWhereFromFilters(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined): Prisma.ProductReviewWhereInput {
  return {
    ...(dateRange ? { createdAt: dateRange } : {}),
    ...(filters.employeeId ? { reviewerEmployeeId: filters.employeeId } : {}),
    ...(filters.category ? { product: { is: { category: filters.category } } } : {})
  };
}

function orderWhereFromFilters(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined): Prisma.OrderWhereInput {
  return {
    ...(dateRange ? { createdAt: dateRange } : {}),
    ...(filters.affiliateId ? { affiliateId: filters.affiliateId } : {}),
    ...(filters.fulfillmentMethod ? { fulfillmentMethod: filters.fulfillmentMethod } : {}),
    ...(filters.category ? { items: { some: { snapshot: { is: { category: filters.category } } } } } : {})
  };
}

function paymentWhereFromFilters(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined): Prisma.PaymentWhereInput {
  return {
    ...(dateRange ? { requestedAt: dateRange } : {}),
    ...(filters.fulfillmentMethod || filters.affiliateId || filters.category ? { order: { is: orderWhereFromFilters(filters, undefined) } } : {})
  };
}

function checkoutDraftWhereFromFilters(filters: AnalyticsFilters, dateRange: Prisma.DateTimeFilter | undefined): Prisma.CheckoutDraftWhereInput {
  return {
    ...(dateRange ? { createdAt: dateRange } : {}),
    ...(filters.fulfillmentMethod ? { fulfillmentMethod: filters.fulfillmentMethod } : {})
  };
}

function inventoryWhereFromFilters(filters: AnalyticsFilters): Prisma.InventoryItemWhereInput {
  return {
    ...(filters.category ? { product: { is: { category: filters.category } } } : {}),
    ...(filters.employeeId ? { createdByEmployeeId: filters.employeeId } : {})
  };
}

export function metric(
  key: string,
  label: string,
  value: number | null,
  unit: AnalyticsMetric["unit"],
  definition: string,
  source: string
): AnalyticsMetric {
  return {
    key,
    label,
    value,
    unit,
    status: value === null ? "NO_SOURCE" : "AVAILABLE",
    definition,
    source
  };
}

export function noSourceMetric(key: string, label: string, note: string): AnalyticsMetric {
  return {
    key,
    label,
    value: null,
    unit: "count",
    status: "NO_SOURCE",
    definition: "暂无真实服务端埋点来源。",
    source: "No source",
    note
  };
}

export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function normalizedFilters(filters: AnalyticsFilters) {
  return {
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    category: filters.category ?? null,
    employeeId: filters.employeeId ?? null,
    affiliateId: filters.affiliateId ?? null,
    fulfillmentMethod: filters.fulfillmentMethod ?? null
  };
}
