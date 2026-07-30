import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  FulfillmentExceptionReason,
  FulfillmentMethod,
  FulfillmentStatus,
  InventoryItemStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  prisma
} from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import { barcodeMatchesOrder, canTransitionFulfillment, normalizeScannedBarcode } from "./operations-fulfillment-state";
import { STAGING_TEST_EMPLOYEE_ID } from "./operations-workspace.service";

const WAREHOUSE_VIEW = "action.warehouse.view";
const WAREHOUSE_EDIT = "action.warehouse.edit";
const ORDERS_VIEW = "action.orders.view";

export type FulfillmentQueueKey =
  | "awaiting-picking"
  | "picking"
  | "packing"
  | "packed"
  | "pickup"
  | "delivery"
  | "completed"
  | "exceptions";

export type OrderQueueKey =
  | "all"
  | "pending-payment"
  | "payment-processing"
  | "paid"
  | "cancelled"
  | "expired"
  | "refunded"
  | "payment-exceptions";

type FulfillmentListInput = {
  queue?: FulfillmentQueueKey;
  search?: string;
  adminUserId?: string;
};

type OrderListInput = {
  queue?: OrderQueueKey;
  search?: string;
  adminUserId?: string;
};

type InventorySearchInput = {
  search?: string;
  adminUserId?: string;
};

type EmployeeInput = {
  employeeId?: string;
  adminUserId?: string;
  note?: string;
};

type ScanInput = EmployeeInput & {
  barcode?: string;
  barcodes?: string[];
};

type PackInput = EmployeeInput & {
  packingStatus?: string;
};

type PickupInput = EmployeeInput & {
  verification?: string;
};

type DeliveryInput = EmployeeInput & {
  riderName?: string;
  riderPhone?: string;
};

type ExceptionInput = EmployeeInput & {
  reason?: FulfillmentExceptionReason;
};

type FulfillmentWithOrder = Prisma.OrderFulfillmentGetPayload<{
  include: ReturnType<OperationsFulfillmentService["fulfillmentInclude"]>;
}>;

@Injectable()
export class OperationsFulfillmentService {
  constructor(private readonly access: OperationsAccessService) {}

  async summary(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, WAREHOUSE_VIEW);
    await this.ensurePaidFulfillments();
    const [awaitingPicking, picking, packing, packed, pickup, delivery, completed, exceptions] = await Promise.all([
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.PAID } }),
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.PICKING, pickedAt: null } }),
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.PICKING, pickedAt: { not: null } } }),
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.PACKED } }),
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.READY_FOR_PICKUP } }),
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.OUT_FOR_DELIVERY } }),
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.COMPLETED } }),
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.EXCEPTION } })
    ]);

    return { awaitingPicking, picking, packing, packed, pickup, delivery, completed, exceptions };
  }

  async listFulfillmentTasks(input: FulfillmentListInput) {
    await this.access.requirePermission(input.adminUserId, WAREHOUSE_VIEW);
    await this.ensurePaidFulfillments();
    const tasks = await prisma.orderFulfillment.findMany({
      where: this.fulfillmentWhere(input),
      include: this.fulfillmentInclude(),
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 80
    });
    return this.attachInventory(tasks);
  }

  async listOrders(input: OrderListInput) {
    await this.access.requirePermission(input.adminUserId, ORDERS_VIEW);
    return prisma.order.findMany({
      where: this.orderWhere(input),
      include: {
        customer: true,
        items: {
          include: { snapshot: true },
          orderBy: { createdAt: "asc" }
        },
        payments: {
          orderBy: { requestedAt: "desc" },
          take: 1
        },
        fulfillment: true
      },
      orderBy: { createdAt: "desc" },
      take: 120
    });
  }

  async searchInventory(input: InventorySearchInput) {
    await this.access.requirePermission(input.adminUserId, WAREHOUSE_VIEW);
    const search = input.search?.trim();
    return prisma.inventoryItem.findMany({
      where: search
        ? {
            OR: [
              { barcode: { contains: search, mode: "insensitive" } },
              { product: { productCode: { contains: search, mode: "insensitive" } } },
              { product: { title: { contains: search, mode: "insensitive" } } },
              { location: { locationCode: { contains: search, mode: "insensitive" } } }
            ]
          }
        : {},
      include: {
        location: true,
        product: {
          include: {
            images: {
              orderBy: { sortOrder: "asc" },
              take: 1
            }
          }
        }
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 80
    });
  }

  async startPicking(orderId: string, input: EmployeeInput) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, WAREHOUSE_EDIT);
    const task = await this.requireFulfillment(orderId);
    this.assertTransition(task, FulfillmentStatus.PICKING);

    await prisma.$transaction(async (transaction) => {
      await transaction.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.FULFILLING }
      });
      const updated = await transaction.orderFulfillment.update({
        where: { orderId },
        data: {
          status: FulfillmentStatus.PICKING,
          assignedPickerEmployeeId: employeeId,
          exceptionReason: null,
          exceptionNote: null
        }
      });
      await this.createEvent(transaction, {
        fulfillmentId: updated.id,
        orderId,
        actorEmployeeId: employeeId,
        action: "START_PICKING",
        oldStatus: task.status,
        newStatus: updated.status,
        note: input.note
      });
    });

    return this.fulfillmentDetail(orderId);
  }

  async confirmPicked(orderId: string, input: ScanInput) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, WAREHOUSE_EDIT);
    const task = await this.requireFulfillment(orderId);
    if (task.status !== FulfillmentStatus.PICKING) {
      throw new BadRequestException("Only picking orders can be scan-confirmed.");
    }

    const inventoryByProductId = await this.inventoryByProduct(task.order.items.map((item) => item.productId));
    const expectedBarcodes = task.order.items
      .map((item) => item.snapshot?.barcode || inventoryByProductId.get(item.productId)?.barcode)
      .filter((barcode): barcode is string => Boolean(barcode));
    if (expectedBarcodes.length !== task.order.items.length) {
      return this.moveToException(orderId, task, {
        employeeId,
        reason: FulfillmentExceptionReason.ITEM_NOT_FOUND,
        note: "Order item is missing a barcode or inventory record."
      });
    }

    const scannedBarcodes = scannedBarcodeList(input);
    const missing = expectedBarcodes.filter((expected) => !scannedBarcodes.some((scanned) => barcodeMatchesOrder([expected], scanned)));
    const unknown = scannedBarcodes.filter((scanned) => !barcodeMatchesOrder(expectedBarcodes, scanned));
    if (scannedBarcodes.length === 0 || missing.length > 0 || unknown.length > 0) {
      return this.moveToException(orderId, task, {
        employeeId,
        reason: FulfillmentExceptionReason.BARCODE_MISMATCH,
        scannedBarcode: scannedBarcodes.join(", "),
        note: `Barcode mismatch. Missing: ${missing.join(", ") || "none"}. Unknown: ${unknown.join(", ") || "none"}.`
      });
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.inventoryItem.updateMany({
        where: { productId: { in: task.order.items.map((item) => item.productId) } },
        data: { status: InventoryItemStatus.PICKED }
      });
      const updated = await transaction.orderFulfillment.update({
        where: { orderId },
        data: {
          pickedAt: new Date(),
          exceptionReason: null,
          exceptionNote: null
        }
      });
      await this.createEvent(transaction, {
        fulfillmentId: updated.id,
        orderId,
        actorEmployeeId: employeeId,
        action: "CONFIRM_PICKED",
        oldStatus: task.status,
        newStatus: updated.status,
        note: input.note,
        scannedBarcode: scannedBarcodes.join(", ")
      });
    });

    return this.fulfillmentDetail(orderId);
  }

  async pack(orderId: string, input: PackInput) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, WAREHOUSE_EDIT);
    const task = await this.requireFulfillment(orderId);
    this.assertTransition(task, FulfillmentStatus.PACKED);

    await prisma.$transaction(async (transaction) => {
      await transaction.inventoryItem.updateMany({
        where: { productId: { in: task.order.items.map((item) => item.productId) } },
        data: { status: InventoryItemStatus.PACKED }
      });
      const updated = await transaction.orderFulfillment.update({
        where: { orderId },
        data: {
          status: FulfillmentStatus.PACKED,
          packedByEmployeeId: employeeId,
          packedAt: new Date(),
          packingStatus: input.packingStatus?.trim() || "PACKED",
          packingNote: input.note?.trim() || null
        }
      });
      await this.createEvent(transaction, {
        fulfillmentId: updated.id,
        orderId,
        actorEmployeeId: employeeId,
        action: "PACK",
        oldStatus: task.status,
        newStatus: updated.status,
        note: input.note
      });
    });

    return this.fulfillmentDetail(orderId);
  }

  async readyForPickup(orderId: string, input: EmployeeInput) {
    return this.handoff(orderId, input, FulfillmentStatus.READY_FOR_PICKUP, "READY_FOR_PICKUP", { readyForPickupAt: new Date() });
  }

  async assignDelivery(orderId: string, input: DeliveryInput) {
    const riderName = input.riderName?.trim();
    if (!riderName) throw new BadRequestException("Delivery rider name is required.");
    return this.handoff(orderId, input, FulfillmentStatus.OUT_FOR_DELIVERY, "ASSIGN_DELIVERY", {
      deliveryRiderName: riderName,
      deliveryRiderPhone: input.riderPhone?.trim() || null,
      outForDeliveryAt: new Date()
    });
  }

  async confirmPickup(orderId: string, input: PickupInput) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, WAREHOUSE_EDIT);
    const task = await this.requireFulfillment(orderId);
    this.assertTransition(task, FulfillmentStatus.COMPLETED);
    const verification = input.verification?.trim();
    if (!verification) throw new BadRequestException("Order number or customer phone is required.");
    if (!matchesPickupVerification(task.order.orderNumber, task.order.customer.phone, verification)) {
      throw new BadRequestException("Pickup verification does not match this order.");
    }
    await this.complete(orderId, task, employeeId, "CONFIRM_PICKUP", input.note, {
      pickupConfirmedBy: {
        connect: { id: employeeId }
      },
      completedAt: new Date()
    });
    return this.fulfillmentDetail(orderId);
  }

  async completeDelivery(orderId: string, input: EmployeeInput) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, WAREHOUSE_EDIT);
    const task = await this.requireFulfillment(orderId);
    this.assertTransition(task, FulfillmentStatus.COMPLETED);
    await this.complete(orderId, task, employeeId, "COMPLETE_DELIVERY", input.note, { completedAt: new Date() });
    return this.fulfillmentDetail(orderId);
  }

  async markException(orderId: string, input: ExceptionInput) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, WAREHOUSE_EDIT);
    const task = await this.requireFulfillment(orderId);
    const reason = input.reason && Object.values(FulfillmentExceptionReason).includes(input.reason)
      ? input.reason
      : FulfillmentExceptionReason.OTHER;
    return this.moveToException(orderId, task, { employeeId, reason, note: input.note });
  }

  private async handoff(
    orderId: string,
    input: EmployeeInput,
    toStatus: FulfillmentStatus,
    action: string,
    data: Prisma.OrderFulfillmentUpdateInput
  ) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, WAREHOUSE_EDIT);
    const task = await this.requireFulfillment(orderId);
    this.assertTransition(task, toStatus);

    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.orderFulfillment.update({
        where: { orderId },
        data: {
          ...data,
          status: toStatus
        }
      });
      await this.createEvent(transaction, {
        fulfillmentId: updated.id,
        orderId,
        actorEmployeeId: employeeId,
        action,
        oldStatus: task.status,
        newStatus: updated.status,
        note: input.note
      });
    });

    return this.fulfillmentDetail(orderId);
  }

  private async complete(
    orderId: string,
    task: FulfillmentWithOrder,
    employeeId: string,
    action: string,
    note: string | undefined,
    data: Prisma.OrderFulfillmentUpdateInput
  ) {
    await prisma.$transaction(async (transaction) => {
      await transaction.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.COMPLETED }
      });
      await transaction.inventoryItem.updateMany({
        where: { productId: { in: task.order.items.map((item) => item.productId) } },
        data: { status: InventoryItemStatus.DELIVERED }
      });
      const updated = await transaction.orderFulfillment.update({
        where: { orderId },
        data: {
          ...data,
          status: FulfillmentStatus.COMPLETED
        }
      });
      await this.createEvent(transaction, {
        fulfillmentId: updated.id,
        orderId,
        actorEmployeeId: employeeId,
        action,
        oldStatus: task.status,
        newStatus: updated.status,
        note
      });
    });
  }

  private async moveToException(
    orderId: string,
    task: FulfillmentWithOrder,
    input: {
      employeeId: string;
      reason: FulfillmentExceptionReason;
      note?: string;
      scannedBarcode?: string;
    }
  ) {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.orderFulfillment.update({
        where: { orderId },
        data: {
          status: FulfillmentStatus.EXCEPTION,
          exceptionReason: input.reason,
          exceptionNote: input.note?.trim() || null
        }
      });
      await this.createEvent(transaction, {
        fulfillmentId: updated.id,
        orderId,
        actorEmployeeId: input.employeeId,
        action: "MARK_EXCEPTION",
        oldStatus: task.status,
        newStatus: updated.status,
        note: input.note,
        scannedBarcode: input.scannedBarcode,
        exceptionReason: input.reason
      });
    });
    return this.fulfillmentDetail(orderId);
  }

  private async requireFulfillment(orderId: string): Promise<FulfillmentWithOrder> {
    const existing = await this.fulfillmentDetail(orderId);
    if (existing) return existing;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true }
    });
    if (!order) throw new NotFoundException("Order not found.");
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException("Only paid orders can enter fulfillment.");
    }
    await prisma.orderFulfillment.create({
      data: {
        orderId,
        status: FulfillmentStatus.PAID
      }
    });
    const created = await this.fulfillmentDetail(orderId);
    if (!created) throw new NotFoundException("Fulfillment record not found.");
    return created;
  }

  private async fulfillmentDetail(orderId: string): Promise<FulfillmentWithOrder | null> {
    return prisma.orderFulfillment.findUnique({
      where: { orderId },
      include: this.fulfillmentInclude()
    });
  }

  private assertTransition(task: FulfillmentWithOrder, toStatus: FulfillmentStatus) {
    if (!canTransitionFulfillment({
      from: task.status,
      to: toStatus,
      fulfillmentMethod: task.order.fulfillmentMethod,
      pickedAt: task.pickedAt
    })) {
      throw new BadRequestException(`Fulfillment cannot move from ${task.status} to ${toStatus}.`);
    }
  }

  private async ensurePaidFulfillments() {
    const paidOrders = await prisma.order.findMany({
      where: {
        status: OrderStatus.PAID,
        fulfillment: null
      },
      select: { id: true },
      take: 100
    });
    for (const order of paidOrders) {
      await prisma.orderFulfillment.upsert({
        where: { orderId: order.id },
        update: {},
        create: {
          orderId: order.id,
          status: FulfillmentStatus.PAID
        }
      });
    }
  }

  private fulfillmentWhere(input: FulfillmentListInput): Prisma.OrderFulfillmentWhereInput {
    const where: Prisma.OrderFulfillmentWhereInput = {};
    const queue = input.queue;
    if (queue === "awaiting-picking") where.status = FulfillmentStatus.PAID;
    if (queue === "picking") {
      where.status = FulfillmentStatus.PICKING;
      where.pickedAt = null;
    }
    if (queue === "packing") {
      where.status = FulfillmentStatus.PICKING;
      where.pickedAt = { not: null };
    }
    if (queue === "packed") where.status = FulfillmentStatus.PACKED;
    if (queue === "pickup") where.status = FulfillmentStatus.READY_FOR_PICKUP;
    if (queue === "delivery") where.status = FulfillmentStatus.OUT_FOR_DELIVERY;
    if (queue === "completed") where.status = FulfillmentStatus.COMPLETED;
    if (queue === "exceptions") where.status = FulfillmentStatus.EXCEPTION;

    const search = input.search?.trim();
    if (search) where.order = this.orderSearch(search);
    return where;
  }

  private orderWhere(input: OrderListInput): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};
    const queue = input.queue ?? "all";
    if (queue === "pending-payment") where.status = OrderStatus.PENDING_PAYMENT;
    if (queue === "payment-processing") where.status = OrderStatus.PAYMENT_PROCESSING;
    if (queue === "paid") where.status = OrderStatus.PAID;
    if (queue === "cancelled") where.status = OrderStatus.CANCELLED;
    if (queue === "expired") where.status = OrderStatus.EXPIRED;
    if (queue === "refunded") where.status = OrderStatus.REFUNDED;
    if (queue === "payment-exceptions") {
      where.payments = {
        some: {
          status: { in: [PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.TIMEOUT, PaymentStatus.MANUAL_REVIEW] }
        }
      };
    }
    const search = input.search?.trim();
    if (search) Object.assign(where, this.orderSearch(search));
    return where;
  }

  private orderSearch(search: string): Prisma.OrderWhereInput {
    return {
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customer: { displayName: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search, mode: "insensitive" } } },
        { items: { some: { snapshot: { is: { title: { contains: search, mode: "insensitive" } } } } } },
        { items: { some: { snapshot: { is: { barcode: { contains: search, mode: "insensitive" } } } } } }
      ]
    };
  }

  private fulfillmentInclude() {
    return {
      order: {
        include: {
          customer: true,
          items: {
            include: { snapshot: true },
            orderBy: { createdAt: "asc" }
          },
          payments: {
            orderBy: { requestedAt: "desc" },
            take: 1
          }
        }
      },
      assignedPicker: true,
      packedBy: true,
      pickupConfirmedBy: true,
      events: {
        include: { actorEmployee: true },
        orderBy: { createdAt: "desc" },
        take: 12
      }
    } as const;
  }

  private async attachInventory(tasks: FulfillmentWithOrder[]) {
    const productIds = [...new Set(tasks.flatMap((task) => task.order.items.map((item) => item.productId)))];
    const inventory = await this.inventoryByProduct(productIds);
    return tasks.map((task) => ({
      ...task,
      order: {
        ...task.order,
        items: task.order.items.map((item) => ({
          ...item,
          inventoryItem: inventory.get(item.productId) ?? null
        }))
      }
    }));
  }

  private async inventoryByProduct(productIds: string[]) {
    const items = productIds.length
      ? await prisma.inventoryItem.findMany({
          where: { productId: { in: productIds } },
          include: { location: true }
        })
      : [];
    return new Map(items.map((item) => [item.productId, item]));
  }

  private async createEvent(
    transaction: Prisma.TransactionClient,
    input: {
      fulfillmentId: string;
      orderId: string;
      actorEmployeeId: string;
      action: string;
      oldStatus: FulfillmentStatus | null;
      newStatus: FulfillmentStatus;
      note?: string;
      scannedBarcode?: string;
      exceptionReason?: FulfillmentExceptionReason;
    }
  ) {
    await transaction.fulfillmentEvent.create({
      data: {
        fulfillmentId: input.fulfillmentId,
        orderId: input.orderId,
        actorEmployeeId: input.actorEmployeeId,
        action: input.action,
        oldStatus: input.oldStatus,
        newStatus: input.newStatus,
        note: input.note?.trim() || null,
        scannedBarcode: input.scannedBarcode?.trim() || null,
        exceptionReason: input.exceptionReason ?? null
      }
    });
  }
}

function employeeIdOrDefault(employeeId?: string): string {
  return employeeId?.trim() || STAGING_TEST_EMPLOYEE_ID;
}

function scannedBarcodeList(input: ScanInput): string[] {
  const values = input.barcodes?.length ? input.barcodes : input.barcode?.split(/[,\n]+/) ?? [];
  return values.map(normalizeScannedBarcode).filter(Boolean);
}

function matchesPickupVerification(orderNumber: string, phone: string | null, verification: string): boolean {
  const normalized = verification.trim().toLowerCase();
  if (orderNumber.toLowerCase() === normalized) return true;
  return normalizePhone(phone) === normalizePhone(verification);
}

function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}
