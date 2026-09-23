import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ActorType,
  SourceApp,
  type CustomerServiceCase,
  CustomerServiceCaseStatus,
  CustomerServiceCaseType,
  CustomerServiceEscalationTarget,
  CustomerServiceIssueType,
  CustomerServicePriority,
  FulfillmentMethod,
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  prisma
} from "@online-saler/database";
import {
  CUSTOMER_SERVICE_SLA_SETTING_KEY,
  customerServiceCaseTypesByGroup,
  customerServiceSlaDueAt,
  defaultPriorityForCaseType,
  isCustomerServiceCaseOverdue,
  isCustomerServiceCaseType,
  issueTypeForCaseType,
  resolveCustomerServiceSlaHours,
  suggestedEscalationTarget,
  type CustomerServicePriorityName
} from "@online-saler/business-rules";
import { OperationsAccessService } from "./operations-access.service";

const CUSTOMER_SERVICE_VIEW = "action.customer-service.view";
const CUSTOMER_SERVICE_CREATE = "action.customer-service.create";
const CUSTOMER_SERVICE_EDIT = "action.customer-service.edit";
const CUSTOMER_SERVICE_ASSIGN = "customer-service.assign";
const CUSTOMER_SERVICE_ESCALATE = "customer-service.escalate";
const CUSTOMER_SERVICE_CONTACT = "customer-service.contact-update";

/** Once the package is with the rider, the address on file is no longer ours. */
const SHIPPED_STATUSES: FulfillmentStatus[] = [FulfillmentStatus.OUT_FOR_DELIVERY, FulfillmentStatus.COMPLETED];

/** Case rows the queue screens read, with the people attached. */
const CASE_INCLUDE = {
  afterSaleReturn: { select: { id: true, status: true } },
  customer: true,
  order: {
    include: {
      payments: { orderBy: { requestedAt: "desc" as const }, take: 1 },
      fulfillment: true,
      items: { include: { snapshot: true }, orderBy: { createdAt: "asc" as const } }
    }
  },
  createdByAdminUser: { select: { id: true, name: true } },
  assignedAdminUser: { select: { id: true, name: true } },
  escalatedByAdminUser: { select: { id: true, name: true } },
  refundRequests: { select: { id: true, status: true, amountKsh: true } },
  notes: {
    include: { authorAdminUser: { select: { name: true } } },
    orderBy: { createdAt: "desc" as const },
    take: 8
  }
} as const;

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
  caseType?: CustomerServiceCaseType;
  priority?: CustomerServicePriority;
  assignedAdminUserId?: string;
  escalatedTo?: CustomerServiceEscalationTarget;
  /** "1" narrows the list to cases that have missed their SLA deadline. */
  overdue?: string;
  unassigned?: string;
};

type CreateCaseInput = {
  adminUserId?: string;
  customerId?: string;
  orderId?: string;
  /** The coarse queue. Ignored when caseType is given, which decides it. */
  issueType?: CustomerServiceIssueType;
  caseType?: CustomerServiceCaseType;
  priority?: CustomerServicePriority;
  assignedAdminUserId?: string;
  title?: string;
  description?: string;
  tags?: string[] | string;
};

type AssignCaseInput = {
  adminUserId?: string;
  assignedAdminUserId?: string | null;
  note?: string;
};

type EscalateCaseInput = {
  adminUserId?: string;
  escalatedTo?: CustomerServiceEscalationTarget;
  note?: string;
  /** Passing false stands the case back down to customer service. */
  escalated?: boolean;
};

type UpdateContactInput = {
  adminUserId?: string;
  customerId?: string;
  phone?: string;
  whatsappPhone?: string;
  defaultAddress?: string;
  /** Only the delivery address of an order that has not shipped. */
  orderId?: string;
  deliveryAddress?: string;
  deliveryNote?: string;
  reason?: string;
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
  caseType?: CustomerServiceCaseType;
  priority?: CustomerServicePriority;
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
    // Guests have no email or name, so the phone is how customer service finds
    // them. Shoppers read it out as "0712..." while it is stored as "254712...",
    // so match on the last nine digits too.
    const searchDigits = search?.replace(/\D/g, "") ?? "";
    const phoneTail = searchDigits.length >= 9 ? searchDigits.slice(-9) : "";
    return prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { normalizedEmail: { contains: search.toLowerCase(), mode: "insensitive" } },
              { displayName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              ...(phoneTail ? [{ phone: { contains: phoneTail } }] : [])
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
    const cases = await prisma.customerServiceCase.findMany({
      where: serviceCaseWhere(input),
      include: CASE_INCLUDE,
      // Unfinished first, then the nearest deadline: the order an agent picking
      // up the queue should work in. Cases with no deadline sort last.
      orderBy: [{ status: "asc" }, { slaDueAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      take: 120
    });
    const now = new Date();
    return cases.map((serviceCase) => ({ ...serviceCase, overdue: isCustomerServiceCaseOverdue(serviceCase, now) }));
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
    const caseType = validCaseType(input.caseType) ?? CustomerServiceCaseType.OTHER;
    // The reason decides the queue. An agent picking "duplicate payment" cannot
    // also file it under delivery, so the two can never drift apart.
    const issueType = issueTypeForCaseType(caseType) as CustomerServiceIssueType;
    const priority = validPriority(input.priority) ?? (defaultPriorityForCaseType(caseType) as CustomerServicePriority);
    const customerId = clean(input.customerId);
    const orderId = clean(input.orderId);
    const now = new Date();
    const slaDueAt = customerServiceSlaDueAt(priority as CustomerServicePriorityName, now, await this.slaHours());

    return prisma.$transaction(async (tx) => {
      // Shared with commission confirmation/payment and the structured return workflow.
      if (orderId) {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true } });
        if (!order) throw new NotFoundException("Order was not found.");
      }
      if (customerId && !await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } })) {
        throw new NotFoundException("Customer was not found.");
      }
      const assignedAdminUserId = clean(input.assignedAdminUserId);
      if (assignedAdminUserId && !await tx.adminUser.findUnique({ where: { id: assignedAdminUserId }, select: { id: true } })) {
        throw new NotFoundException("The admin account to assign this case to was not found.");
      }
      const created = await tx.customerServiceCase.create({
        data: {
          customerId: customerId ?? null,
          orderId: orderId ?? null,
          issueType,
          caseType,
          priority,
          slaDueAt,
          assignedAdminUserId: assignedAdminUserId ?? null,
          assignedAt: assignedAdminUserId ? now : null,
          title,
          description: clean(input.description) ?? null,
          tags: parseTags(input.tags),
          createdByAdminUserId: session.adminUser?.id ?? null
        },
        include: CASE_INCLUDE
      });
      await tx.auditLog.create({ data: {
        actorType: ActorType.EMPLOYEE,
        actorId: session.adminUser?.linkedEmployeeId ?? null,
        actorAdminUserId: session.adminUser?.id ?? null,
        sourceApp: SourceApp.OPERATIONS,
        module: "customer-service", entityType: "CustomerServiceCase", entityId: created.id,
        action: "CUSTOMER_SERVICE_CASE_CREATE", beforeJson: {}, afterJson: caseAuditState(created),
        reason: clean(input.description) ?? title
      } });
      return created;
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
    const session = await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_EDIT);
    const status = validCaseStatus(input.status);
    const caseType = validCaseType(input.caseType);
    const priority = validPriority(input.priority);
    const now = new Date();
    const data: Prisma.CustomerServiceCaseUpdateInput = {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: clean(input.description) ?? null } : {}),
      ...(input.tags !== undefined ? { tags: parseTags(input.tags) } : {}),
      // Re-classifying a case moves it to the queue its new reason belongs to.
      ...(caseType ? { caseType, issueType: issueTypeForCaseType(caseType) as CustomerServiceIssueType } : {})
    };
    if (priority) data.priority = priority;
    const slaHours = priority ? await this.slaHours() : null;
    if (status) {
      data.status = status;
      data.resolvedAt = status === CustomerServiceCaseStatus.RESOLVED || status === CustomerServiceCaseStatus.CLOSED ? now : null;
      data.closedAt = status === CustomerServiceCaseStatus.CLOSED ? now : null;
    }
    return prisma.$transaction(async (tx) => {
      const identity = await tx.customerServiceCase.findUnique({ where: { id: caseId }, select: { orderId: true } });
      if (!identity) throw new NotFoundException("Customer service case was not found.");
      if (identity.orderId) {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${identity.orderId} FOR UPDATE`;
      }
      // Standalone cases also need a stable before-state for their audit record.
      await tx.$queryRaw`SELECT "id" FROM "CustomerServiceCase" WHERE "id" = ${caseId} FOR UPDATE`;
      const existing = await tx.customerServiceCase.findUnique({ where: { id: caseId }, include: { afterSaleReturn: { select: { id: true } } } });
      if (!existing) throw new NotFoundException("Customer service case was not found.");
      if (existing.orderId !== identity.orderId) throw new ConflictException("Case order changed. Refresh before continuing.");
      if (existing.afterSaleReturn && input.status !== undefined) {
        throw new BadRequestException("Use the return workflow to change this managed after-sale case status.");
      }
      if (priority && slaHours) {
        // The new deadline is measured from when the customer first raised the
        // case, not from now. Re-prioritising must not quietly buy back the
        // hours the case has already burned.
        data.slaDueAt = customerServiceSlaDueAt(priority as CustomerServicePriorityName, existing.createdAt, slaHours);
      }
      const updated = await tx.customerServiceCase.update({ where: { id: caseId }, data, include: CASE_INCLUDE });
      await tx.auditLog.create({ data: {
        actorType: ActorType.EMPLOYEE,
        actorId: session.adminUser?.linkedEmployeeId ?? null,
        actorAdminUserId: session.adminUser?.id ?? null,
        sourceApp: SourceApp.OPERATIONS,
        module: "customer-service", entityType: "CustomerServiceCase", entityId: caseId,
        action: "CUSTOMER_SERVICE_CASE_UPDATE", beforeJson: caseAuditState(existing), afterJson: caseAuditState(updated),
        reason: clean(input.description) ?? "Customer service case updated."
      } });
      return updated;
    });
  }

  /** One case with everything support has already done to it. */
  async caseDetail(caseId: string, adminUserId?: string) {
    await this.access.requirePermission(adminUserId, CUSTOMER_SERVICE_VIEW);
    const serviceCase = await prisma.customerServiceCase.findUnique({
      where: { id: caseId },
      include: { ...CASE_INCLUDE, notes: { include: { authorAdminUser: { select: { name: true } } }, orderBy: { createdAt: "desc" as const } } }
    });
    if (!serviceCase) throw new NotFoundException("Customer service case was not found.");
    return { ...serviceCase, overdue: isCustomerServiceCaseOverdue(serviceCase) };
  }

  /**
   * Gives a case a named owner, so "who is handling this?" has an answer that
   * is not "customer service". Passing null puts it back in the pool.
   */
  async assignCase(caseId: string, input: AssignCaseInput) {
    const session = await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_ASSIGN);
    const assignee = clean(input.assignedAdminUserId) ?? null;
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CustomerServiceCase" WHERE "id" = ${caseId} FOR UPDATE`;
      const existing = await tx.customerServiceCase.findUnique({ where: { id: caseId } });
      if (!existing) throw new NotFoundException("Customer service case was not found.");
      if (existing.status === CustomerServiceCaseStatus.CLOSED) {
        throw new BadRequestException("A closed case cannot be reassigned. Reopen it first.");
      }
      const adminUser = assignee
        ? await tx.adminUser.findUnique({ where: { id: assignee }, select: { id: true, status: true, linkedEmployeeId: true } })
        : null;
      if (assignee && !adminUser) throw new NotFoundException("The admin account to assign this case to was not found.");
      if (adminUser && adminUser.status !== "ACTIVE") {
        throw new BadRequestException("A case cannot be assigned to an account that is not active.");
      }
      const updated = await tx.customerServiceCase.update({
        where: { id: caseId },
        data: {
          assignedAdminUserId: assignee,
          // The employee link is kept in step so the older after-sale screens,
          // which only know about employees, still show the same owner.
          assignedEmployeeId: adminUser?.linkedEmployeeId ?? null,
          assignedAt: assignee ? new Date() : null,
          // Picking up an unstarted case is what starting work looks like.
          ...(assignee && existing.status === CustomerServiceCaseStatus.OPEN
            ? { status: CustomerServiceCaseStatus.IN_PROGRESS }
            : {})
        },
        include: CASE_INCLUDE
      });
      await writeCaseAudit(tx, session, caseId, "CUSTOMER_SERVICE_CASE_ASSIGN", existing, updated,
        clean(input.note) ?? (assignee ? "Case assigned." : "Case returned to the unassigned pool."));
      return updated;
    });
  }

  /**
   * Hands a case to whoever can actually finish it.
   *
   * Escalation is a flag and a destination, not a status: the case stays open
   * and customer service stays on the hook for telling the customer what
   * happened. It just now also appears on fulfillment's, finance's or an
   * administrator's alert list.
   */
  async escalateCase(caseId: string, input: EscalateCaseInput) {
    const session = await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_ESCALATE);
    const standDown = input.escalated === false;
    const note = clean(input.note);
    if (!standDown && !note) throw new BadRequestException("Escalating a case requires a note saying why.");

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CustomerServiceCase" WHERE "id" = ${caseId} FOR UPDATE`;
      const existing = await tx.customerServiceCase.findUnique({ where: { id: caseId } });
      if (!existing) throw new NotFoundException("Customer service case was not found.");
      if (!standDown && existing.status === CustomerServiceCaseStatus.CLOSED) {
        throw new BadRequestException("A closed case cannot be escalated. Reopen it first.");
      }
      // Where it goes is the agent's call; the case type only suggests a default.
      const target = validEscalationTarget(input.escalatedTo)
        ?? (suggestedEscalationTarget(existing.caseType) as CustomerServiceEscalationTarget);
      const updated = await tx.customerServiceCase.update({
        where: { id: caseId },
        data: standDown
          ? { escalated: false, escalatedTo: null, escalatedAt: null, escalatedByAdminUserId: null, escalationNote: note ?? null }
          : {
              escalated: true,
              escalatedTo: target,
              escalatedAt: new Date(),
              escalatedByAdminUserId: session.adminUser?.id ?? null,
              escalationNote: note,
              ...(existing.status === CustomerServiceCaseStatus.OPEN ? { status: CustomerServiceCaseStatus.IN_PROGRESS } : {})
            },
        include: CASE_INCLUDE
      });
      await writeCaseAudit(tx, session, caseId,
        standDown ? "CUSTOMER_SERVICE_CASE_DE_ESCALATE" : "CUSTOMER_SERVICE_CASE_ESCALATE",
        existing, updated, note ?? "Case stood back down to customer service.");
      return updated;
    });
  }

  /**
   * Corrects the contact details a delivery depends on.
   *
   * This is the one thing on the customer record support may change, and it is
   * deliberately narrow: a phone number, a WhatsApp number, an address. Nothing
   * here touches price, payment, stock or attribution, and an address can only
   * be corrected while the package is still with us -- once it is out for
   * delivery, changing the address behind the rider's back helps nobody.
   */
  async updateCustomerContact(input: UpdateContactInput) {
    const session = await this.access.requirePermission(input.adminUserId, CUSTOMER_SERVICE_CONTACT);
    const reason = clean(input.reason);
    if (!reason) throw new BadRequestException("A contact change requires a reason.");
    const customerId = clean(input.customerId);
    const orderId = clean(input.orderId);
    if (!customerId && !orderId) throw new BadRequestException("Name the customer or the order to correct.");

    return prisma.$transaction(async (tx) => {
      const result: { customer?: unknown; order?: unknown } = {};

      if (customerId) {
        const existing = await tx.customer.findUnique({ where: { id: customerId } });
        if (!existing) throw new NotFoundException("Customer was not found.");
        const data: Prisma.CustomerUpdateInput = {
          ...(input.phone !== undefined ? { phone: requirePhone(input.phone) } : {}),
          ...(input.defaultAddress !== undefined ? { defaultAddress: clean(input.defaultAddress) ?? null } : {})
        };
        if (Object.keys(data).length) {
          const updated = await tx.customer.update({ where: { id: customerId }, data });
          result.customer = updated;
          await writeAuditRow(tx, session, "Customer", customerId, "CUSTOMER_SERVICE_CONTACT_UPDATE",
            { phone: existing.phone, defaultAddress: existing.defaultAddress },
            { phone: updated.phone, defaultAddress: updated.defaultAddress }, reason);
        }
      }

      if (orderId) {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
        const existing = await tx.order.findUnique({ where: { id: orderId }, include: { fulfillment: { select: { status: true } } } });
        if (!existing) throw new NotFoundException("Order was not found.");
        const shipped = existing.fulfillment !== null && SHIPPED_STATUSES.includes(existing.fulfillment.status);
        if (shipped && input.deliveryAddress !== undefined) {
          throw new BadRequestException("The delivery address cannot be changed once the order is with the rider. Raise a delivery case instead.");
        }
        const data: Prisma.OrderUpdateInput = {
          ...(input.deliveryAddress !== undefined ? { deliveryAddress: clean(input.deliveryAddress) ?? null } : {}),
          ...(input.deliveryNote !== undefined ? { deliveryNote: clean(input.deliveryNote) ?? null } : {}),
          ...(input.whatsappPhone !== undefined ? { whatsappPhone: requirePhone(input.whatsappPhone) } : {})
        };
        if (Object.keys(data).length) {
          const updated = await tx.order.update({ where: { id: orderId }, data });
          result.order = updated;
          await writeAuditRow(tx, session, "Order", orderId, "CUSTOMER_SERVICE_CONTACT_UPDATE",
            { deliveryAddress: existing.deliveryAddress, deliveryNote: existing.deliveryNote, whatsappPhone: existing.whatsappPhone },
            { deliveryAddress: updated.deliveryAddress, deliveryNote: updated.deliveryNote, whatsappPhone: updated.whatsappPhone }, reason);
        }
      }

      return result;
    });
  }

  /** Accounts a case can be handed to, for the assignment picker. */
  async assignees(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, CUSTOMER_SERVICE_VIEW);
    const admins = await prisma.adminUser.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { permissions: { some: { permission: { code: CUSTOMER_SERVICE_VIEW } } } } } }
      },
      select: {
        id: true,
        name: true,
        _count: { select: { assignedServiceCases: { where: { status: { in: [CustomerServiceCaseStatus.OPEN, CustomerServiceCaseStatus.IN_PROGRESS] } } } } }
      },
      orderBy: { name: "asc" }
    });
    return admins.map((admin) => ({ id: admin.id, name: admin.name, openCases: admin._count.assignedServiceCases }));
  }

  /** The case-type picker, grouped, plus the SLA hours currently in force. */
  async caseOptions(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, CUSTOMER_SERVICE_VIEW);
    return { groups: customerServiceCaseTypesByGroup(), slaHours: await this.slaHours() };
  }

  /** SLA hours per priority, overridable in system settings without a deploy. */
  private async slaHours() {
    const setting = await prisma.systemSetting.findUnique({ where: { key: CUSTOMER_SERVICE_SLA_SETTING_KEY } });
    return resolveCustomerServiceSlaHours(setting?.valueJson);
  }
}

function serviceOrderWhere(input: SearchInput): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  const queue = input.queue ?? "all";
  if (queue === "payment") {
    where.OR = [
      // A deposit order is a payment queue case by definition: half is in and
      // the rest is on a clock. DEPOSIT_EXPIRED is here because it leaves a
      // refund owed, which is the agent's problem too.
      { status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_PROCESSING, OrderStatus.DEPOSIT_PAID, OrderStatus.DEPOSIT_EXPIRED] } },
      { payments: { some: { status: { in: [PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.TIMEOUT, PaymentStatus.MANUAL_REVIEW] } } } }
    ];
  }
  if (queue === "pickup") {
    where.fulfillmentMethod = FulfillmentMethod.PICKUP;
    where.fulfillment = { is: { status: { in: [FulfillmentStatus.PAID, FulfillmentStatus.PICKING, FulfillmentStatus.READY_TO_PACK, FulfillmentStatus.PACKED, FulfillmentStatus.READY_FOR_PICKUP] } } };
  }
  if (queue === "delivery") {
    where.fulfillmentMethod = FulfillmentMethod.KIKUYU_LOCAL_DELIVERY;
    where.fulfillment = { is: { status: { in: [FulfillmentStatus.PAID, FulfillmentStatus.PICKING, FulfillmentStatus.READY_TO_PACK, FulfillmentStatus.PACKED, FulfillmentStatus.READY_FOR_DISPATCH, FulfillmentStatus.OUT_FOR_DELIVERY, FulfillmentStatus.EXCEPTION] } } };
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
  if (validCaseType(input.caseType)) where.caseType = input.caseType;
  if (validPriority(input.priority)) where.priority = input.priority;
  if (validEscalationTarget(input.escalatedTo)) {
    where.escalated = true;
    where.escalatedTo = input.escalatedTo;
  }
  const unfinished = { in: [CustomerServiceCaseStatus.OPEN, CustomerServiceCaseStatus.IN_PROGRESS] };
  if (input.assignedAdminUserId) where.assignedAdminUserId = input.assignedAdminUserId;
  if (input.unassigned === "1") {
    where.assignedAdminUserId = null;
    where.status = where.status ?? unfinished;
  }
  if (input.overdue === "1") {
    // The same test as isCustomerServiceCaseOverdue, written as a query so the
    // queue does not have to load every case to filter it.
    where.status = unfinished;
    where.slaDueAt = { not: null, lte: new Date() };
  }
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

function validCaseType(value?: CustomerServiceCaseType): CustomerServiceCaseType | undefined {
  // Checked against the business-rules taxonomy rather than the enum, so a
  // value the rules do not know how to route can never reach the database.
  return isCustomerServiceCaseType(value) ? (value as CustomerServiceCaseType) : undefined;
}

function validPriority(value?: CustomerServicePriority): CustomerServicePriority | undefined {
  return value && Object.values(CustomerServicePriority).includes(value) ? value : undefined;
}

function validEscalationTarget(value?: CustomerServiceEscalationTarget): CustomerServiceEscalationTarget | undefined {
  return value && Object.values(CustomerServiceEscalationTarget).includes(value) ? value : undefined;
}

/** A number the SMS gateway and M-Pesa will both accept, or nothing. */
function requirePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  const kenyan = /^0[17]\d{8}$/.test(digits) || /^[17]\d{8}$/.test(digits) || /^254[17]\d{8}$/.test(digits);
  if (!kenyan) throw new BadRequestException("Enter a Kenyan mobile number, for example 0712345678.");
  return trimmed;
}

type SessionLike = { adminUser?: { id: string; linkedEmployeeId?: string | null } | null };

function writeCaseAudit(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  caseId: string,
  action: string,
  before: CustomerServiceCase,
  after: CustomerServiceCase,
  reason: string
) {
  return writeAuditRow(tx, session, "CustomerServiceCase", caseId, action, caseAuditState(before), caseAuditState(after), reason);
}

function writeAuditRow(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  entityType: string,
  entityId: string,
  action: string,
  beforeJson: Prisma.InputJsonValue,
  afterJson: Prisma.InputJsonValue,
  reason: string
) {
  return tx.auditLog.create({
    data: {
      actorType: ActorType.EMPLOYEE,
      actorId: session.adminUser?.linkedEmployeeId ?? null,
      actorAdminUserId: session.adminUser?.id ?? null,
      sourceApp: SourceApp.OPERATIONS,
      module: "customer-service",
      entityType,
      entityId,
      action,
      beforeJson,
      afterJson,
      reason
    }
  });
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

function caseAuditState(record: CustomerServiceCase): Prisma.InputJsonObject {
  return {
    orderId: record.orderId, customerId: record.customerId, issueType: record.issueType,
    caseType: record.caseType, priority: record.priority,
    assignedAdminUserId: record.assignedAdminUserId,
    assignedAt: record.assignedAt?.toISOString() ?? null,
    escalated: record.escalated, escalatedTo: record.escalatedTo,
    escalatedAt: record.escalatedAt?.toISOString() ?? null,
    escalatedByAdminUserId: record.escalatedByAdminUserId,
    escalationNote: record.escalationNote,
    slaDueAt: record.slaDueAt?.toISOString() ?? null,
    closedAt: record.closedAt?.toISOString() ?? null,
    status: record.status, title: record.title, description: record.description,
    tags: record.tags, assignedEmployeeId: record.assignedEmployeeId,
    afterSaleReason: record.afterSaleReason, customerRequest: record.customerRequest,
    requiresReturn: record.requiresReturn, requiresRefund: record.requiresRefund,
    affectsAffiliateCommission: record.affectsAffiliateCommission,
    resolvedAt: record.resolvedAt?.toISOString() ?? null
  };
}
