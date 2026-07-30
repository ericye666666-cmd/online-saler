import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CustomerServiceCaseStatus,
  CustomerServiceIssueType,
  FulfillmentMethod,
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  prisma
} from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";

const CUSTOMER_SERVICE_VIEW = "action.customer-service.view";
const CUSTOMER_SERVICE_CREATE = "action.customer-service.create";
const CUSTOMER_SERVICE_EDIT = "action.customer-service.edit";

export type CustomerServiceQueueKey =
  | "all"
  | "payment"
  | "pickup"
  | "delivery"
  | "after-sales"
  | "notes";

type SearchInput = {
  adminUserId?: string;
  search?: string;
  queue?: CustomerServiceQueueKey;
};

type CaseListInput = SearchInput & {
  issueType?: CustomerServiceIssueType;
  status?: CustomerServiceCaseStatus;
};

type CreateCaseInput = {
  adminUserId?: string;
  customerId?: string;
  orderId?: string;
  issueType?: CustomerServiceIssueType;
  title?: string;
  description?: string;
  tags?: string[] | string;
};

type CreateNoteInput = {
  adminUserId?: string;
  caseId?: string;
  customerId?: string;
  orderId?: string;
  body?: string;
  tags?: string[] | string;
};

type UpdateCaseInput = {
  adminUserId?: string;
  status?: CustomerServiceCaseStatus;
  title?: string;
  description?: string | null;
  tags?: string[] | string;
};

@Injectable()
export class OperationsCustomerServiceService {
  constructor(private readonly access: OperationsAccessService) {}

  async summary(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, CUSTOMER_SERVICE_VIEW);
    const [customers, openCases, paymentCases, pickupCases, deliveryCases, afterSaleCases, recentNotes] = await Promise.all([
      prisma.customer.count(),
      prisma.customerServiceCase.count({ where: { status: { in: [CustomerServiceCaseStatus.OPEN, CustomerServiceCaseStatus.IN_PROGRESS] } } }),
      prisma.customerServiceCase.count({ where: { issueType: CustomerServiceIssueType.PAYMENT } }),
      prisma.customerServiceCase.count({ where: { issueType: CustomerServiceIssueType.PICKUP } }),
      prisma.customerServiceCase.count({ where: { issueType: CustomerServiceIssueType.DELIVERY } }),
      prisma.customerServiceCase.count({ where: { issueType: CustomerServiceIssueType.AFTER_SALE } }),
      prisma.customerServiceNote.count()
    ]);

    return {
      customers,
      openCases,
      paymentCases,
      pickupCases,
      deliveryCases,
      afterSaleCases,
      recentNotes
    };
  }

  async searchCustomers(input: SearchInput) {
    await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_VIEW);
    const search = input.search?.trim();
    return prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { normalizedEmail: { contains: search.toLowerCase(), mode: "insensitive" } },
              { displayName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } }
            ]
          }
        : {},
      include: {
        _count: {
          select: {
            orders: true,
            customerServiceCases: true,
            customerServiceNotes: true
          }
        },
        orders: {
          include: {
            payments: { orderBy: { requestedAt: "desc" }, take: 1 },
            fulfillment: true
          },
          orderBy: { createdAt: "desc" },
          take: 3
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 80
    });
  }

  async searchOrders(input: SearchInput) {
    await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_VIEW);
    return prisma.order.findMany({
      where: serviceOrderWhere(input),
      include: {
        customer: true,
        payments: { orderBy: { requestedAt: "desc" }, take: 3 },
        fulfillment: true,
        items: { include: { snapshot: true }, orderBy: { createdAt: "asc" } },
        customerServiceCases: { orderBy: { updatedAt: "desc" }, take: 3 }
      },
      orderBy: { createdAt: "desc" },
      take: 120
    });
  }

  async listCases(input: CaseListInput) {
    await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_VIEW);
    return prisma.customerServiceCase.findMany({
      where: serviceCaseWhere(input),
      include: {
        customer: true,
        order: {
          include: {
            payments: { orderBy: { requestedAt: "desc" }, take: 1 },
            fulfillment: true,
            items: { include: { snapshot: true }, orderBy: { createdAt: "asc" } }
          }
        },
        createdByAdminUser: true,
        notes: {
          include: { authorAdminUser: true },
          orderBy: { createdAt: "desc" },
          take: 8
        }
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 120
    });
  }

  async listNotes(input: SearchInput) {
    await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_VIEW);
    const search = input.search?.trim();
    return prisma.customerServiceNote.findMany({
      where: search
        ? {
            OR: [
              { body: { contains: search, mode: "insensitive" } },
              { customer: { displayName: { contains: search, mode: "insensitive" } } },
              { customer: { email: { contains: search, mode: "insensitive" } } },
              { order: { orderNumber: { contains: search, mode: "insensitive" } } }
            ]
          }
        : {},
      include: {
        customer: true,
        order: true,
        authorAdminUser: true,
        case: true
      },
      orderBy: { createdAt: "desc" },
      take: 150
    });
  }

  async createCase(input: CreateCaseInput) {
    const session = await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_CREATE);
    const title = input.title?.trim();
    if (!title) throw new BadRequestException("Case title is required.");
    const issueType = validIssueType(input.issueType) ?? CustomerServiceIssueType.OTHER;
    const customerId = clean(input.customerId);
    const orderId = clean(input.orderId);

    if (customerId) await assertCustomerExists(customerId);
    if (orderId) await assertOrderExists(orderId);

    return prisma.customerServiceCase.create({
      data: {
        customerId: customerId ?? null,
        orderId: orderId ?? null,
        issueType,
        title,
        description: clean(input.description) ?? null,
        tags: parseTags(input.tags),
        createdByAdminUserId: session.adminUser?.id ?? null
      },
      include: {
        customer: true,
        order: true,
        createdByAdminUser: true,
        notes: true
      }
    });
  }

  async createNote(input: CreateNoteInput) {
    const session = await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_CREATE);
    const body = input.body?.trim();
    if (!body) throw new BadRequestException("Note body is required.");
    const caseId = clean(input.caseId);
    const customerId = clean(input.customerId);
    const orderId = clean(input.orderId);

    if (!caseId && !customerId && !orderId) {
      throw new BadRequestException("Note must be attached to a case, customer, or order.");
    }
    if (caseId) await assertCaseExists(caseId);
    if (customerId) await assertCustomerExists(customerId);
    if (orderId) await assertOrderExists(orderId);

    return prisma.customerServiceNote.create({
      data: {
        caseId: caseId ?? null,
        customerId: customerId ?? null,
        orderId: orderId ?? null,
        authorAdminUserId: session.adminUser?.id ?? null,
        body,
        tags: parseTags(input.tags)
      },
      include: {
        customer: true,
        order: true,
        authorAdminUser: true,
        case: true
      }
    });
  }

  async updateCase(caseId: string, input: UpdateCaseInput) {
    await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_EDIT);
    const existing = await prisma.customerServiceCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException("Customer service case was not found.");
    const status = validCaseStatus(input.status);
    const data: Prisma.CustomerServiceCaseUpdateInput = {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: clean(input.description) ?? null } : {}),
      ...(input.tags !== undefined ? { tags: parseTags(input.tags) } : {})
    };
    if (status) {
      data.status = status;
      data.resolvedAt = status === CustomerServiceCaseStatus.RESOLVED || status === CustomerServiceCaseStatus.CLOSED ? new Date() : null;
    }
    return prisma.customerServiceCase.update({
      where: { id: caseId },
      data,
      include: {
        customer: true,
        order: true,
        createdByAdminUser: true,
        notes: { include: { authorAdminUser: true }, orderBy: { createdAt: "desc" } }
      }
    });
  }
}

function serviceOrderWhere(input: SearchInput): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  const queue = input.queue ?? "all";
  if (queue === "payment") {
    where.OR = [
      { status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_PROCESSING] } },
      { payments: { some: { status: { in: [PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.TIMEOUT, PaymentStatus.MANUAL_REVIEW] } } } }
    ];
  }
  if (queue === "pickup") {
    where.fulfillmentMethod = FulfillmentMethod.PICKUP;
    where.fulfillment = { is: { status: { in: [FulfillmentStatus.PAID, FulfillmentStatus.PICKING, FulfillmentStatus.PACKED, FulfillmentStatus.READY_FOR_PICKUP] } } };
  }
  if (queue === "delivery") {
    where.fulfillmentMethod = FulfillmentMethod.KIKUYU_LOCAL_DELIVERY;
    where.fulfillment = { is: { status: { in: [FulfillmentStatus.PAID, FulfillmentStatus.PICKING, FulfillmentStatus.PACKED, FulfillmentStatus.OUT_FOR_DELIVERY, FulfillmentStatus.EXCEPTION] } } };
  }
  if (queue === "after-sales") {
    where.status = { in: [OrderStatus.COMPLETED, OrderStatus.REFUNDED] };
  }
  const search = input.search?.trim();
  if (search) {
    const searchWhere = orderSearch(search);
    where.OR = where.OR ? [...where.OR, ...searchWhere.OR] : searchWhere.OR;
  }
  return where;
}

function serviceCaseWhere(input: CaseListInput): Prisma.CustomerServiceCaseWhereInput {
  const where: Prisma.CustomerServiceCaseWhereInput = {};
  if (validIssueType(input.issueType)) where.issueType = input.issueType;
  if (validCaseStatus(input.status)) where.status = input.status;
  if (input.queue === "payment") where.issueType = CustomerServiceIssueType.PAYMENT;
  if (input.queue === "pickup") where.issueType = CustomerServiceIssueType.PICKUP;
  if (input.queue === "delivery") where.issueType = CustomerServiceIssueType.DELIVERY;
  if (input.queue === "after-sales") where.issueType = CustomerServiceIssueType.AFTER_SALE;
  const search = input.search?.trim();
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { customer: { displayName: { contains: search, mode: "insensitive" } } },
      { customer: { email: { contains: search, mode: "insensitive" } } },
      { order: { orderNumber: { contains: search, mode: "insensitive" } } }
    ];
  }
  return where;
}

function orderSearch(search: string): { OR: Prisma.OrderWhereInput[] } {
  return {
    OR: [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { customer: { displayName: { contains: search, mode: "insensitive" } } },
      { customer: { email: { contains: search, mode: "insensitive" } } },
      { customer: { phone: { contains: search, mode: "insensitive" } } },
      { items: { some: { snapshot: { is: { title: { contains: search, mode: "insensitive" } } } } } },
      { items: { some: { snapshot: { is: { barcode: { contains: search, mode: "insensitive" } } } } } }
    ]
  };
}

export function parseTags(tags?: string[] | string): Prisma.InputJsonValue | undefined {
  if (Array.isArray(tags)) {
    const cleaned = tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
    return cleaned.length ? cleaned : undefined;
  }
  const cleaned = tags
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
  return cleaned?.length ? cleaned : undefined;
}

function validIssueType(value?: CustomerServiceIssueType): CustomerServiceIssueType | undefined {
  return value && Object.values(CustomerServiceIssueType).includes(value) ? value : undefined;
}

function validCaseStatus(value?: CustomerServiceCaseStatus): CustomerServiceCaseStatus | undefined {
  return value && Object.values(CustomerServiceCaseStatus).includes(value) ? value : undefined;
}

function clean(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

async function assertCustomerExists(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) throw new NotFoundException("Customer was not found.");
}

async function assertOrderExists(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) throw new NotFoundException("Order was not found.");
}

async function assertCaseExists(caseId: string) {
  const serviceCase = await prisma.customerServiceCase.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!serviceCase) throw new NotFoundException("Customer service case was not found.");
}
