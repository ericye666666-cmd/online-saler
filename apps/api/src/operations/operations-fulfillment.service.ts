import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CustomerServiceCaseStatus,
  CustomerServiceIssueType,
  DeliveryRiderType,
  EmployeeStatus,
  FulfillmentExceptionReason,
  FulfillmentItemStatus,
  FulfillmentMethod,
  FulfillmentStatus,
  InventoryItemStatus,
  OrderStatus,
  PackagingMethod,
  PaymentStatus,
  PickupVerificationMethod,
  Prisma,
  prisma
} from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import {
  canTransitionFulfillment,
  maskCustomerPhone,
  orderCenterTab,
  type OrderCenterTab,
  verifyFulfillmentItemBarcode
} from "./operations-fulfillment-state";
import { refreshWarehouseLocationStatuses } from "./warehouse-capacity";

const ORDER_INCLUDE = {
  customer: true,
  affiliate: true,
  items: {
    include: { snapshot: true },
    orderBy: { createdAt: "asc" }
  },
  payments: {
    orderBy: { requestedAt: "desc" },
    take: 1
  },
  fulfillment: {
    include: {
      assignedPicker: true,
      packingStartedBy: true,
      packedBy: true,
      dispatchedBy: true,
      pickupConfirmedBy: true,
      afterSaleOwner: true,
      deliveryRider: { include: { employee: true } },
      items: { include: { verifiedBy: true }, orderBy: { createdAt: "asc" } },
      deliveryAssignments: {
        include: { deliveryRider: { include: { employee: true } }, assignedByAdminUser: true },
        orderBy: { createdAt: "desc" }
      },
      events: {
        include: {
          actorEmployee: true,
          actorAdminUser: true,
          relatedEmployee: true,
          deliveryRider: true,
          orderItem: { include: { snapshot: true } }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  },
  customerServiceCases: {
    include: { assignedEmployee: true, createdByAdminUser: true },
    orderBy: { updatedAt: "desc" }
  }
} as const;

type OrderDetail = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export type OrderCenterScope = "workbench" | "all" | "after-sales" | "exceptions";

export type OrderCenterListInput = {
  adminUserId?: string;
  scope?: OrderCenterScope;
  tab?: OrderCenterTab;
  dateFrom?: string;
  dateTo?: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  productName?: string;
  barcode?: string;
  fulfillmentMethod?: FulfillmentMethod;
  paymentStatus?: PaymentStatus;
  orderStatus?: OrderStatus;
  pickerEmployeeId?: string;
  packerEmployeeId?: string;
  rider?: string;
  affiliate?: string;
};

export type AdminInput = { adminUserId?: string; note?: string };
export type EmployeeInput = AdminInput & { employeeId?: string };
export type ScanInput = AdminInput & { barcode?: string };
export type PackingInput = EmployeeInput & { packagingMethod?: PackagingMethod; packageCount?: number };
export type PickupInput = AdminInput & { verificationMethod?: PickupVerificationMethod; verificationValue?: string };
export type RiderInput = AdminInput & {
  riderType?: DeliveryRiderType;
  employeeId?: string;
  name?: string;
  phone?: string;
  company?: string;
  vehicle?: string;
  estimatedDeliveryAt?: string;
};
export type ExceptionInput = AdminInput & { reason?: FulfillmentExceptionReason };
export type AfterSaleInput = AdminInput & {
  employeeId?: string;
  caseId?: string;
  status?: CustomerServiceCaseStatus;
  afterSaleReason?: string;
  customerRequest?: string;
  requiresReturn?: boolean;
  requiresRefund?: boolean;
  affectsAffiliateCommission?: boolean;
};

type EventInput = {
  idempotencyKey?: string;
  fulfillmentId: string;
  orderId: string;
  actorAdminUserId?: string | null;
  actorEmployeeId?: string | null;
  relatedEmployeeId?: string | null;
  deliveryRiderId?: string | null;
  orderItemId?: string | null;
  action: string;
  oldStatus: FulfillmentStatus | null;
  newStatus: FulfillmentStatus;
  note?: string | null;
  expectedBarcode?: string | null;
  scannedBarcode?: string | null;
  exceptionReason?: FulfillmentExceptionReason | null;
};

@Injectable()
export class OperationsFulfillmentService {
  constructor(private readonly access: OperationsAccessService) {}

  async summary(input: OrderCenterListInput) {
    await this.access.requirePermission(input.adminUserId, "orders.view");
    await this.ensurePaidFulfillments();
    const orders = await prisma.order.findMany({
      where: this.orderWhere({ ...input, scope: "all", tab: "all" }),
      select: {
        status: true,
        fulfillment: { select: { status: true } },
        customerServiceCases: { select: { issueType: true, status: true } }
      }
    });
    const counts: Record<OrderCenterTab, number> = {
      all: orders.length,
      "pending-payment": 0,
      "waiting-pick": 0,
      picking: 0,
      "ready-to-pack": 0,
      packed: 0,
      "ready-for-pickup": 0,
      "ready-for-dispatch": 0,
      "out-for-delivery": 0,
      completed: 0,
      "after-sale": 0,
      cancelled: 0
    };
    for (const order of orders) {
      const tab = orderCenterTab({
        orderStatus: order.status,
        fulfillmentStatus: order.fulfillment?.status,
        hasOpenAfterSale: order.customerServiceCases.some(
          (item) => item.issueType === CustomerServiceIssueType.AFTER_SALE && item.status !== CustomerServiceCaseStatus.CLOSED
        )
      });
      if (tab !== "all") counts[tab] += 1;
    }
    return counts;
  }

  async listOrders(input: OrderCenterListInput) {
    await this.access.requirePermission(input.adminUserId, "orders.view");
    await this.ensurePaidFulfillments();
    const orders = await prisma.order.findMany({
      where: this.orderWhere(input),
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 150
    });
    return this.attachInventory(orders);
  }

  async orderDetail(orderId: string, adminUserId?: string) {
    await this.access.requirePermission(adminUserId, "orders.view");
    await this.ensurePaidFulfillments(orderId);
    const order = await this.requireOrder(orderId);
    return (await this.attachInventory([order]))[0];
  }

  async employees(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, "orders.view");
    return prisma.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE },
      select: { id: true, employeeCode: true, name: true, phone: true },
      orderBy: [{ name: "asc" }, { employeeCode: "asc" }]
    });
  }

  async assignPicker(orderId: string, input: EmployeeInput) {
    const actor = await this.adminForPermission(input.adminUserId, "orders.assign-picker");
    const employee = await this.requireEmployee(input.employeeId);
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status !== FulfillmentStatus.PAID && fulfillment.status !== FulfillmentStatus.PICKING) {
      throw new BadRequestException("Picker can only be assigned before picking is complete.");
    }
    if (fulfillment.assignedPickerEmployeeId === employee.id) return this.orderDetail(orderId, input.adminUserId);
    await prisma.$transaction(async (tx) => {
      await tx.orderFulfillment.update({ where: { id: fulfillment.id }, data: { assignedPickerEmployeeId: employee.id } });
      await this.createEvent(tx, {
        idempotencyKey: `assign-picker:${fulfillment.id}:${employee.id}:${fulfillment.assignedPickerEmployeeId ?? "unassigned"}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: employee.id,
        action: "ASSIGN_PICKER",
        oldStatus: fulfillment.status,
        newStatus: fulfillment.status,
        note: input.note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async claimPicking(orderId: string, input: AdminInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.pick");
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status === FulfillmentStatus.PICKING && fulfillment.assignedPickerEmployeeId === actor.actorEmployeeId) {
      return this.orderDetail(orderId, input.adminUserId);
    }
    if (fulfillment.assignedPickerEmployeeId && fulfillment.assignedPickerEmployeeId !== actor.actorEmployeeId) {
      throw new ForbiddenException("This picking task is assigned to another employee.");
    }
    this.assertTransition(order, FulfillmentStatus.PICKING);
    await prisma.$transaction(async (tx) => {
      await tx.order.updateMany({ where: { id: orderId, status: OrderStatus.PAID }, data: { status: OrderStatus.FULFILLING } });
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: { status: FulfillmentStatus.PICKING, assignedPickerEmployeeId: actor.actorEmployeeId }
      });
      await this.createEvent(tx, {
        idempotencyKey: `transition:${fulfillment.id}:${FulfillmentStatus.PICKING}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: actor.actorEmployeeId,
        action: fulfillment.assignedPickerEmployeeId ? "START_PICKING" : "CLAIM_PICKING_TASK",
        oldStatus: fulfillment.status,
        newStatus: FulfillmentStatus.PICKING,
        note: input.note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async scanItem(orderId: string, orderItemId: string, input: ScanInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.pick");
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status !== FulfillmentStatus.PICKING) throw new BadRequestException("Only an active picking task accepts barcode scans.");
    if (fulfillment.assignedPickerEmployeeId && fulfillment.assignedPickerEmployeeId !== actor.actorEmployeeId) {
      throw new ForbiddenException("This picking task is assigned to another employee.");
    }
    const fulfillmentItem = fulfillment.items.find((item) => item.orderItemId === orderItemId);
    const orderItem = order.items.find((item) => item.id === orderItemId);
    if (!fulfillmentItem || !orderItem) throw new NotFoundException("Order item was not found in this picking task.");
    const inventoryItem = await prisma.inventoryItem.findUnique({
      where: { productId: orderItem.productId },
      include: { location: true }
    });
    const expectedBarcode = fulfillmentItem.expectedBarcode || orderItem.snapshot?.barcode || inventoryItem?.barcode || null;
    const check = verifyFulfillmentItemBarcode({
      orderItemId,
      expectedBarcode,
      scannedBarcode: input.barcode ?? "",
      productName: orderItem.snapshot?.title ?? "Unnamed product",
      locationCode: inventoryItem?.location?.locationCode ?? null
    });
    if (!check.ok) {
      await prisma.$transaction((tx) => this.createEvent(tx, {
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        orderItemId,
        action: "BARCODE_REJECTED",
        oldStatus: fulfillment.status,
        newStatus: fulfillment.status,
        note: input.note,
        expectedBarcode: check.expectedBarcode,
        scannedBarcode: check.actualBarcode,
        exceptionReason: FulfillmentExceptionReason.BARCODE_MISMATCH
      }));
      throw new BadRequestException({
        message: "Barcode does not match the selected order item.",
        expectedBarcode: check.expectedBarcode,
        actualBarcode: check.actualBarcode,
        productName: check.productName,
        locationCode: check.locationCode
      });
    }
    if (fulfillmentItem.status === FulfillmentItemStatus.VERIFIED) return this.orderDetail(orderId, input.adminUserId);

    await prisma.$transaction(async (tx) => {
      await tx.fulfillmentItem.update({
        where: { orderItemId },
        data: {
          status: FulfillmentItemStatus.VERIFIED,
          scannedBarcode: check.normalizedBarcode,
          verifiedByEmployeeId: actor.actorEmployeeId,
          verifiedAt: new Date()
        }
      });
      await this.createEvent(tx, {
        idempotencyKey: `scan:${fulfillment.id}:${orderItemId}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: actor.actorEmployeeId,
        orderItemId,
        action: "ITEM_BARCODE_VERIFIED",
        oldStatus: fulfillment.status,
        newStatus: fulfillment.status,
        note: input.note,
        expectedBarcode,
        scannedBarcode: check.normalizedBarcode
      });
      const remaining = await tx.fulfillmentItem.count({
        where: { fulfillmentId: fulfillment.id, status: FulfillmentItemStatus.PENDING }
      });
      if (remaining === 0) {
        const pickedInventory = await tx.inventoryItem.findMany({
          where: { productId: { in: order.items.map((item) => item.productId) } },
          select: { locationId: true }
        });
        await tx.orderFulfillment.update({
          where: { id: fulfillment.id },
          data: { status: FulfillmentStatus.READY_TO_PACK, pickedAt: new Date() }
        });
        await tx.inventoryItem.updateMany({
          where: { productId: { in: order.items.map((item) => item.productId) } },
          data: { status: InventoryItemStatus.PICKED }
        });
        await refreshWarehouseLocationStatuses(
          tx,
          pickedInventory.map((item) => item.locationId ?? "")
        );
        await this.createEvent(tx, {
          idempotencyKey: `transition:${fulfillment.id}:${FulfillmentStatus.READY_TO_PACK}`,
          fulfillmentId: fulfillment.id,
          orderId,
          ...actor,
          relatedEmployeeId: actor.actorEmployeeId,
          action: "COMPLETE_PICKING",
          oldStatus: FulfillmentStatus.PICKING,
          newStatus: FulfillmentStatus.READY_TO_PACK,
          note: "All order item barcodes were verified."
        });
      }
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async startPacking(orderId: string, input: EmployeeInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.pack");
    const packerId = input.employeeId?.trim() || actor.actorEmployeeId!;
    if (packerId !== actor.actorEmployeeId) await this.access.requirePermission(input.adminUserId, "orders.assign-picker");
    await this.requireEmployee(packerId);
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status !== FulfillmentStatus.READY_TO_PACK) throw new BadRequestException("Packing can start only after every item is verified.");
    if (fulfillment.packingStartedAt && fulfillment.packingStartedByEmployeeId === packerId) {
      return this.orderDetail(orderId, input.adminUserId);
    }
    await prisma.$transaction(async (tx) => {
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: { packingStartedAt: new Date(), packingStartedByEmployeeId: packerId }
      });
      await this.createEvent(tx, {
        idempotencyKey: `start-packing:${fulfillment.id}:${packerId}:${fulfillment.packingStartedByEmployeeId ?? "unassigned"}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: packerId,
        action: "START_PACKING",
        oldStatus: fulfillment.status,
        newStatus: fulfillment.status,
        note: input.note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async completePacking(orderId: string, input: PackingInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.pack");
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status === FulfillmentStatus.PACKED) return this.orderDetail(orderId, input.adminUserId);
    if (!fulfillment.packingStartedAt) throw new BadRequestException("Start packing before completing it.");
    this.assertTransition(order, FulfillmentStatus.PACKED);
    const packerId = input.employeeId?.trim() || fulfillment.packingStartedByEmployeeId || actor.actorEmployeeId!;
    if (packerId !== actor.actorEmployeeId) await this.access.requirePermission(input.adminUserId, "orders.assign-picker");
    await this.requireEmployee(packerId);
    const packagingMethod = input.packagingMethod && Object.values(PackagingMethod).includes(input.packagingMethod)
      ? input.packagingMethod
      : null;
    const packageCount = Number(input.packageCount);
    if (!packagingMethod) throw new BadRequestException("Packaging method must be Bag, Box, or Other.");
    if (!Number.isInteger(packageCount) || packageCount < 1) throw new BadRequestException("Package count must be at least one.");
    await prisma.$transaction(async (tx) => {
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: {
          status: FulfillmentStatus.PACKED,
          packedByEmployeeId: packerId,
          packedAt: new Date(),
          packagingMethod,
          packageCount,
          packingStatus: packagingMethod,
          packingNote: input.note?.trim() || null
        }
      });
      await tx.inventoryItem.updateMany({
        where: { productId: { in: order.items.map((item) => item.productId) } },
        data: { status: InventoryItemStatus.PACKED }
      });
      await this.createEvent(tx, {
        idempotencyKey: `transition:${fulfillment.id}:${FulfillmentStatus.PACKED}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: packerId,
        action: "COMPLETE_PACKING",
        oldStatus: fulfillment.status,
        newStatus: FulfillmentStatus.PACKED,
        note: input.note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async readyForPickup(orderId: string, input: AdminInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.pack");
    return this.moveToHandoff(orderId, input, actor, FulfillmentStatus.READY_FOR_PICKUP, "READY_FOR_PICKUP", {
      readyForPickupAt: new Date()
    });
  }

  async readyForDispatch(orderId: string, input: AdminInput) {
    const actor = await this.adminForPermission(input.adminUserId, "orders.assign-rider");
    return this.moveToHandoff(orderId, input, actor, FulfillmentStatus.READY_FOR_DISPATCH, "READY_FOR_DISPATCH", {
      readyForDispatchAt: new Date()
    });
  }

  async assignRider(orderId: string, input: RiderInput) {
    const actor = await this.adminForPermission(input.adminUserId, "orders.assign-rider");
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (order.fulfillmentMethod !== FulfillmentMethod.KIKUYU_LOCAL_DELIVERY) {
      throw new BadRequestException("Pickup orders cannot be assigned to a delivery rider.");
    }
    if (fulfillment.status !== FulfillmentStatus.READY_FOR_DISPATCH) {
      throw new BadRequestException("The order must be ready for dispatch before rider assignment.");
    }
    const riderType = input.riderType && Object.values(DeliveryRiderType).includes(input.riderType) ? input.riderType : null;
    if (!riderType) throw new BadRequestException("Rider type is required.");
    const rider = riderType === DeliveryRiderType.INTERNAL
      ? await this.internalRider(input.employeeId)
      : await this.externalRider(input);
    const estimatedDeliveryAt = input.estimatedDeliveryAt ? new Date(input.estimatedDeliveryAt) : null;
    if (estimatedDeliveryAt && Number.isNaN(estimatedDeliveryAt.getTime())) throw new BadRequestException("Estimated delivery time is invalid.");
    const latest = fulfillment.deliveryAssignments[0];
    if (
      fulfillment.deliveryRiderId === rider.id
      && latest?.estimatedDeliveryAt?.getTime() === estimatedDeliveryAt?.getTime()
      && (latest?.note ?? "") === (input.note?.trim() ?? "")
    ) return this.orderDetail(orderId, input.adminUserId);

    await prisma.$transaction(async (tx) => {
      await tx.deliveryAssignment.create({
        data: {
          fulfillmentId: fulfillment.id,
          orderId,
          deliveryRiderId: rider.id,
          assignedByAdminUserId: actor.actorAdminUserId,
          estimatedDeliveryAt,
          note: input.note?.trim() || null
        }
      });
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: { deliveryRiderId: rider.id, deliveryRiderName: rider.name, deliveryRiderPhone: rider.phone }
      });
      await this.createEvent(tx, {
        idempotencyKey: `assign-rider:${fulfillment.id}:${latest?.id ?? "initial"}:${rider.id}:${estimatedDeliveryAt?.toISOString() ?? "unscheduled"}:${input.note?.trim() ?? ""}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: rider.employeeId,
        deliveryRiderId: rider.id,
        action: "ASSIGN_DELIVERY_RIDER",
        oldStatus: fulfillment.status,
        newStatus: fulfillment.status,
        note: input.note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async dispatch(orderId: string, input: AdminInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.dispatch");
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status === FulfillmentStatus.OUT_FOR_DELIVERY) return this.orderDetail(orderId, input.adminUserId);
    this.assertTransition(order, FulfillmentStatus.OUT_FOR_DELIVERY);
    await prisma.$transaction(async (tx) => {
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: {
          status: FulfillmentStatus.OUT_FOR_DELIVERY,
          dispatchedByEmployeeId: actor.actorEmployeeId,
          dispatchedAt: new Date(),
          outForDeliveryAt: new Date()
        }
      });
      await this.createEvent(tx, {
        idempotencyKey: `transition:${fulfillment.id}:${FulfillmentStatus.OUT_FOR_DELIVERY}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: actor.actorEmployeeId,
        deliveryRiderId: fulfillment.deliveryRiderId,
        action: "HAND_TO_DELIVERY_RIDER",
        oldStatus: fulfillment.status,
        newStatus: FulfillmentStatus.OUT_FOR_DELIVERY,
        note: input.note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async confirmPickup(orderId: string, input: PickupInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.complete");
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status === FulfillmentStatus.COMPLETED) return this.orderDetail(orderId, input.adminUserId);
    if (order.fulfillmentMethod !== FulfillmentMethod.PICKUP) throw new BadRequestException("Delivery orders cannot be completed as pickup.");
    this.assertTransition(order, FulfillmentStatus.COMPLETED);
    const method = input.verificationMethod && Object.values(PickupVerificationMethod).includes(input.verificationMethod)
      ? input.verificationMethod
      : null;
    const value = input.verificationValue?.trim() || "";
    if (!method || !value || !pickupVerificationMatches(order, method, value)) {
      throw new BadRequestException("Pickup verification does not match the order number, customer phone, or pickup code.");
    }
    await this.completeOrder(order, actor, "CONFIRM_CUSTOMER_PICKUP", input.note, {
      pickupConfirmedByEmployeeId: actor.actorEmployeeId,
      pickupVerificationMethod: method,
      pickupVerificationValue: value,
      pickupNote: input.note?.trim() || null
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async completeDelivery(orderId: string, input: AdminInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.complete");
    const order = await this.requireOrderWithTask(orderId);
    if (order.fulfillment?.status === FulfillmentStatus.COMPLETED) return this.orderDetail(orderId, input.adminUserId);
    if (order.fulfillmentMethod !== FulfillmentMethod.KIKUYU_LOCAL_DELIVERY) {
      throw new BadRequestException("Pickup orders cannot be completed as delivery.");
    }
    this.assertTransition(order, FulfillmentStatus.COMPLETED);
    await this.completeOrder(order, actor, "CONFIRM_DELIVERY", input.note, {});
    return this.orderDetail(orderId, input.adminUserId);
  }

  async markException(orderId: string, input: ExceptionInput) {
    const actor = await this.employeeForAnyPermission(input.adminUserId, ["orders.pick", "orders.pack", "orders.dispatch"]);
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    const reason = input.reason && Object.values(FulfillmentExceptionReason).includes(input.reason)
      ? input.reason
      : FulfillmentExceptionReason.OTHER;
    if (fulfillment.status === FulfillmentStatus.EXCEPTION && fulfillment.exceptionReason === reason && fulfillment.exceptionNote === input.note?.trim()) {
      return this.orderDetail(orderId, input.adminUserId);
    }
    if (!canTransitionFulfillment({ from: fulfillment.status, to: FulfillmentStatus.EXCEPTION })) {
      throw new BadRequestException("A completed order cannot be moved to fulfillment exception.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: { status: FulfillmentStatus.EXCEPTION, exceptionReason: reason, exceptionNote: input.note?.trim() || null }
      });
      await this.createEvent(tx, {
        idempotencyKey: `exception:${fulfillment.id}:${fulfillment.status}:${reason}:${input.note?.trim() ?? ""}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        action: "SUBMIT_EXCEPTION_FACT",
        oldStatus: fulfillment.status,
        newStatus: FulfillmentStatus.EXCEPTION,
        note: input.note,
        exceptionReason: reason
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async cancel(orderId: string, input: AdminInput) {
    const actor = await this.adminForPermission(input.adminUserId, "orders.cancel");
    const order = await this.requireOrder(orderId);
    if (order.status === OrderStatus.CANCELLED) return this.orderDetail(orderId, input.adminUserId);
    if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException("Completed or refunded orders cannot be cancelled here.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
      if (order.fulfillment) {
        await tx.orderFulfillment.update({
          where: { id: order.fulfillment.id },
          data: {
            status: FulfillmentStatus.EXCEPTION,
            exceptionReason: FulfillmentExceptionReason.CUSTOMER_CANCELLED,
            exceptionNote: input.note?.trim() || null
          }
        });
        await this.createEvent(tx, {
          idempotencyKey: `cancel:${order.fulfillment.id}`,
          fulfillmentId: order.fulfillment.id,
          orderId,
          ...actor,
          action: "CANCEL_ORDER",
          oldStatus: order.fulfillment.status,
          newStatus: FulfillmentStatus.EXCEPTION,
          note: input.note,
          exceptionReason: FulfillmentExceptionReason.CUSTOMER_CANCELLED
        });
      }
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  async assignAfterSale(orderId: string, input: AfterSaleInput) {
    const actor = await this.adminForPermission(input.adminUserId, "orders.after-sale");
    const employee = await this.requireEmployee(input.employeeId);
    const order = await this.requireOrder(orderId);
    if (!order.fulfillment) throw new BadRequestException("After-sale ownership requires an order fulfillment record.");
    if (order.fulfillment.afterSaleOwnerEmployeeId === employee.id && !input.caseId) return this.orderDetail(orderId, input.adminUserId);
    const status = input.status && Object.values(CustomerServiceCaseStatus).includes(input.status) ? input.status : undefined;
    await prisma.$transaction(async (tx) => {
      await tx.orderFulfillment.update({ where: { id: order.fulfillment!.id }, data: { afterSaleOwnerEmployeeId: employee.id } });
      if (input.caseId) {
        await tx.customerServiceCase.updateMany({
          where: { id: input.caseId, orderId, issueType: CustomerServiceIssueType.AFTER_SALE },
          data: {
            assignedEmployeeId: employee.id,
            ...(status ? { status } : {}),
            ...(input.afterSaleReason !== undefined ? { afterSaleReason: input.afterSaleReason.trim() || null } : {}),
            ...(input.customerRequest !== undefined ? { customerRequest: input.customerRequest.trim() || null } : {}),
            ...(input.requiresReturn !== undefined ? { requiresReturn: input.requiresReturn } : {}),
            ...(input.requiresRefund !== undefined ? { requiresRefund: input.requiresRefund } : {}),
            ...(input.affectsAffiliateCommission !== undefined ? { affectsAffiliateCommission: input.affectsAffiliateCommission } : {}),
            ...(status ? { resolvedAt: status === CustomerServiceCaseStatus.RESOLVED || status === CustomerServiceCaseStatus.CLOSED ? new Date() : null } : {})
          }
        });
      }
      await this.createEvent(tx, {
        idempotencyKey: `after-sale:${order.fulfillment!.id}:${input.caseId ?? "order"}:${employee.id}:${status ?? "unchanged"}:${input.requiresReturn ?? "unchanged"}:${input.requiresRefund ?? "unchanged"}:${input.affectsAffiliateCommission ?? "unchanged"}:${input.afterSaleReason?.trim() ?? ""}:${input.customerRequest?.trim() ?? ""}`,
        fulfillmentId: order.fulfillment!.id,
        orderId,
        ...actor,
        relatedEmployeeId: employee.id,
        action: input.caseId ? "UPDATE_AFTER_SALE_CASE" : "ASSIGN_AFTER_SALE_OWNER",
        oldStatus: order.fulfillment!.status,
        newStatus: order.fulfillment!.status,
        note: input.note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  private async moveToHandoff(
    orderId: string,
    input: AdminInput,
    actor: Pick<EventInput, "actorAdminUserId" | "actorEmployeeId">,
    status: FulfillmentStatus,
    action: string,
    data: Prisma.OrderFulfillmentUpdateInput
  ) {
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status === status) return this.orderDetail(orderId, input.adminUserId);
    this.assertTransition(order, status);
    await prisma.$transaction(async (tx) => {
      await tx.orderFulfillment.update({ where: { id: fulfillment.id }, data: { ...data, status } });
      await this.createEvent(tx, {
        idempotencyKey: `transition:${fulfillment.id}:${status}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        action,
        oldStatus: fulfillment.status,
        newStatus: status,
        note: input.note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  private async completeOrder(
    order: OrderDetail,
    actor: Pick<EventInput, "actorAdminUserId" | "actorEmployeeId">,
    action: string,
    note: string | undefined,
    fulfillmentData: Prisma.OrderFulfillmentUncheckedUpdateInput
  ) {
    const fulfillment = order.fulfillment!;
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.COMPLETED } });
      await tx.inventoryItem.updateMany({
        where: { productId: { in: order.items.map((item) => item.productId) } },
        data: { status: InventoryItemStatus.DELIVERED }
      });
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: { ...fulfillmentData, status: FulfillmentStatus.COMPLETED, completedAt: new Date() }
      });
      await this.createEvent(tx, {
        idempotencyKey: `transition:${fulfillment.id}:${FulfillmentStatus.COMPLETED}`,
        fulfillmentId: fulfillment.id,
        orderId: order.id,
        ...actor,
        action,
        oldStatus: fulfillment.status,
        newStatus: FulfillmentStatus.COMPLETED,
        note
      });
    });
  }

  private orderWhere(input: OrderCenterListInput): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = [];
    if (input.scope === "after-sales") and.push(afterSaleWhere());
    if (input.scope === "exceptions") and.push({ fulfillment: { is: { status: FulfillmentStatus.EXCEPTION } } });
    if (input.tab && input.tab !== "all") and.push(tabWhere(input.tab));

    const createdAt: Prisma.DateTimeFilter = {};
    if (input.dateFrom) createdAt.gte = validDate(input.dateFrom, "Start date");
    if (input.dateTo) createdAt.lt = exclusiveDateEnd(input.dateTo);
    if (createdAt.gte || createdAt.lt) and.push({ createdAt });
    if (input.orderNumber?.trim()) and.push({ orderNumber: { contains: input.orderNumber.trim(), mode: "insensitive" } });
    if (input.customerName?.trim()) and.push({ customer: { displayName: { contains: input.customerName.trim(), mode: "insensitive" } } });
    if (input.customerPhone?.trim()) and.push({ customer: { phone: { contains: input.customerPhone.trim(), mode: "insensitive" } } });
    if (input.productName?.trim()) and.push({ items: { some: { snapshot: { is: { title: { contains: input.productName.trim(), mode: "insensitive" } } } } } });
    if (input.barcode?.trim()) and.push({ items: { some: { snapshot: { is: { barcode: { contains: input.barcode.trim(), mode: "insensitive" } } } } } });
    if (input.fulfillmentMethod && Object.values(FulfillmentMethod).includes(input.fulfillmentMethod)) and.push({ fulfillmentMethod: input.fulfillmentMethod });
    if (input.paymentStatus && Object.values(PaymentStatus).includes(input.paymentStatus)) and.push({ payments: { some: { status: input.paymentStatus } } });
    if (input.orderStatus && Object.values(OrderStatus).includes(input.orderStatus)) and.push({ status: input.orderStatus });
    if (input.pickerEmployeeId?.trim()) and.push({ fulfillment: { is: { assignedPickerEmployeeId: input.pickerEmployeeId.trim() } } });
    if (input.packerEmployeeId?.trim()) and.push({ fulfillment: { is: { packedByEmployeeId: input.packerEmployeeId.trim() } } });
    if (input.rider?.trim()) {
      const value = input.rider.trim();
      and.push({ fulfillment: { is: { deliveryRider: { is: {
        OR: [
          { name: { contains: value, mode: "insensitive" } },
          { phone: { contains: value, mode: "insensitive" } },
          { company: { contains: value, mode: "insensitive" } },
          { employee: { name: { contains: value, mode: "insensitive" } } }
        ]
      } } } } });
    }
    if (input.affiliate?.trim()) {
      const value = input.affiliate.trim();
      and.push({ OR: [
        { affiliateSource: { contains: value, mode: "insensitive" } },
        { affiliateCampaign: { contains: value, mode: "insensitive" } },
        { affiliate: { affiliateCode: { contains: value, mode: "insensitive" } } },
        { affiliate: { displayName: { contains: value, mode: "insensitive" } } }
      ] });
    }
    return and.length ? { AND: and } : {};
  }

  private async requireOrder(orderId: string): Promise<OrderDetail> {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException("Order was not found.");
    return order;
  }

  private async requireOrderWithTask(orderId: string) {
    await this.ensurePaidFulfillments(orderId);
    const order = await this.requireOrder(orderId);
    if (!order.fulfillment) throw new BadRequestException("This order does not have a picking task.");
    return order;
  }

  private assertTransition(order: OrderDetail, to: FulfillmentStatus) {
    const fulfillment = order.fulfillment;
    if (!fulfillment || !canTransitionFulfillment({
      from: fulfillment.status,
      to,
      fulfillmentMethod: order.fulfillmentMethod,
      hasDeliveryRider: Boolean(fulfillment.deliveryRiderId)
    })) throw new BadRequestException(`Fulfillment cannot move from ${fulfillment?.status ?? "NONE"} to ${to}.`);
  }

  private async ensurePaidFulfillments(orderId?: string) {
    const orders = await prisma.order.findMany({
      where: { ...(orderId ? { id: orderId } : {}), status: OrderStatus.PAID },
      include: { items: { include: { snapshot: true } }, fulfillment: { include: { items: true } } },
      take: orderId ? 1 : 100
    });
    for (const order of orders) {
      await prisma.$transaction(async (tx) => {
        const fulfillment = await tx.orderFulfillment.upsert({
          where: { orderId: order.id },
          update: {},
          create: { orderId: order.id, status: FulfillmentStatus.PAID }
        });
        await tx.fulfillmentItem.createMany({
          data: order.items.map((item) => ({
            fulfillmentId: fulfillment.id,
            orderItemId: item.id,
            expectedBarcode: item.snapshot?.barcode?.trim() || null
          })),
          skipDuplicates: true
        });
        await this.createEvent(tx, {
          idempotencyKey: `pick-task:${order.id}`,
          fulfillmentId: fulfillment.id,
          orderId: order.id,
          action: "PAYMENT_CONFIRMED_PICK_TASK_CREATED",
          oldStatus: null,
          newStatus: FulfillmentStatus.PAID,
          note: "Payment confirmed; one order-level picking task was created."
        });
      });
    }
  }

  private async attachInventory(orders: OrderDetail[]) {
    const productIds = [...new Set(orders.flatMap((order) => order.items.map((item) => item.productId)))];
    const inventory = productIds.length ? await prisma.inventoryItem.findMany({
      where: { productId: { in: productIds } },
      include: {
        location: true,
        product: {
          select: {
            images: {
              orderBy: { sortOrder: "asc" },
              take: 1,
              select: { publicUrl: true, originalUrl: true }
            }
          }
        }
      }
    }) : [];
    const byProduct = new Map(inventory.map((item) => [item.productId, item]));
    return orders.map((order) => ({
      ...order,
      customer: {
        ...order.customer,
        phone: maskCustomerPhone(order.customer.phone)
      },
      payments: order.payments.map((payment) => ({
        ...payment,
        phone: maskCustomerPhone(payment.phone)
      })),
      centerTab: orderCenterTab({
        orderStatus: order.status,
        fulfillmentStatus: order.fulfillment?.status,
        hasOpenAfterSale: order.customerServiceCases.some(
          (item) => item.issueType === CustomerServiceIssueType.AFTER_SALE && item.status !== CustomerServiceCaseStatus.CLOSED
        )
      }),
      items: order.items.map((item) => {
        const inventoryItem = byProduct.get(item.productId);
        const currentImage = inventoryItem?.product.images[0];
        return {
          ...item,
          displayImageUrl: currentImage?.publicUrl || currentImage?.originalUrl || item.snapshot?.imageUrl || null,
          inventoryItem: inventoryItem ? {
            id: inventoryItem.id,
            barcode: inventoryItem.barcode,
            status: inventoryItem.status,
            location: inventoryItem.location
          } : null
        };
      })
    }));
  }

  private async requireEmployee(employeeId?: string) {
    const id = employeeId?.trim();
    if (!id) throw new BadRequestException("Employee is required.");
    const employee = await prisma.employee.findFirst({ where: { id, status: EmployeeStatus.ACTIVE } });
    if (!employee) throw new BadRequestException("Employee is missing or inactive.");
    return employee;
  }

  private async adminForPermission(adminUserId: string | undefined, permission: string) {
    const session = await this.access.requirePermission(adminUserId, permission);
    return {
      actorAdminUserId: session.adminUser!.id,
      actorEmployeeId: session.adminUser!.linkedEmployee?.id ?? null
    };
  }

  private async employeeForPermission(adminUserId: string | undefined, permission: string) {
    const actor = await this.adminForPermission(adminUserId, permission);
    if (!actor.actorEmployeeId) throw new ForbiddenException("This action requires an active employee linked to the admin account.");
    return actor;
  }

  private async employeeForAnyPermission(adminUserId: string | undefined, permissions: string[]) {
    const session = await this.access.session(adminUserId);
    if (!session.adminUser || !permissions.some((permission) => session.permissions.includes(permission))) {
      throw new ForbiddenException("This admin account does not have permission for this operation.");
    }
    const actorEmployeeId = session.adminUser.linkedEmployee?.id;
    if (!actorEmployeeId) throw new ForbiddenException("This action requires an active employee linked to the admin account.");
    return { actorAdminUserId: session.adminUser.id, actorEmployeeId };
  }

  private async internalRider(employeeId?: string) {
    const employee = await this.requireEmployee(employeeId);
    return prisma.deliveryRider.upsert({
      where: { employeeId: employee.id },
      update: { name: employee.name, phone: employee.phone, type: DeliveryRiderType.INTERNAL },
      create: { type: DeliveryRiderType.INTERNAL, employeeId: employee.id, name: employee.name, phone: employee.phone }
    });
  }

  private async externalRider(input: RiderInput) {
    const name = input.name?.trim();
    const phone = input.phone?.trim();
    if (!name || !phone) throw new BadRequestException("External rider name and phone are required.");
    const existing = await prisma.deliveryRider.findFirst({
      where: {
        type: DeliveryRiderType.EXTERNAL,
        name,
        phone,
        company: input.company?.trim() || null,
        vehicle: input.vehicle?.trim() || null
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing) return existing;
    return prisma.deliveryRider.create({
      data: {
        type: DeliveryRiderType.EXTERNAL,
        name,
        phone,
        company: input.company?.trim() || null,
        vehicle: input.vehicle?.trim() || null
      }
    });
  }

  private async createEvent(tx: Prisma.TransactionClient, input: EventInput) {
    const data: Prisma.FulfillmentEventUncheckedCreateInput = {
      idempotencyKey: input.idempotencyKey ?? null,
      fulfillmentId: input.fulfillmentId,
      orderId: input.orderId,
      actorAdminUserId: input.actorAdminUserId ?? null,
      actorEmployeeId: input.actorEmployeeId ?? null,
      relatedEmployeeId: input.relatedEmployeeId ?? null,
      deliveryRiderId: input.deliveryRiderId ?? null,
      orderItemId: input.orderItemId ?? null,
      action: input.action,
      oldStatus: input.oldStatus,
      newStatus: input.newStatus,
      note: input.note?.trim() || null,
      expectedBarcode: input.expectedBarcode?.trim() || null,
      scannedBarcode: input.scannedBarcode?.trim() || null,
      exceptionReason: input.exceptionReason ?? null
    };
    if (!input.idempotencyKey) return tx.fulfillmentEvent.create({ data });
    return tx.fulfillmentEvent.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: data
    });
  }
}

function tabWhere(tab: OrderCenterTab): Prisma.OrderWhereInput {
  if (tab === "pending-payment") return { status: { in: [OrderStatus.DRAFT, OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_PROCESSING] } };
  if (tab === "waiting-pick") return { fulfillment: { is: { status: FulfillmentStatus.PAID } } };
  if (tab === "picking") return { fulfillment: { is: { status: FulfillmentStatus.PICKING } } };
  if (tab === "ready-to-pack") return { fulfillment: { is: { status: FulfillmentStatus.READY_TO_PACK } } };
  if (tab === "packed") return { fulfillment: { is: { status: FulfillmentStatus.PACKED } } };
  if (tab === "ready-for-pickup") return { fulfillment: { is: { status: FulfillmentStatus.READY_FOR_PICKUP } } };
  if (tab === "ready-for-dispatch") return { fulfillment: { is: { status: FulfillmentStatus.READY_FOR_DISPATCH } } };
  if (tab === "out-for-delivery") return { fulfillment: { is: { status: FulfillmentStatus.OUT_FOR_DELIVERY } } };
  if (tab === "completed") return { OR: [{ status: OrderStatus.COMPLETED }, { fulfillment: { is: { status: FulfillmentStatus.COMPLETED } } }] };
  if (tab === "after-sale") return afterSaleWhere();
  if (tab === "cancelled") return { status: { in: [OrderStatus.CANCELLED, OrderStatus.EXPIRED] } };
  return {};
}

function afterSaleWhere(): Prisma.OrderWhereInput {
  return {
    OR: [
      { status: OrderStatus.REFUNDED },
      { customerServiceCases: { some: { issueType: CustomerServiceIssueType.AFTER_SALE, status: { not: CustomerServiceCaseStatus.CLOSED } } } }
    ]
  };
}

function validDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is invalid.`);
  return date;
}

function exclusiveDateEnd(value: string): Date {
  const date = validDate(value, "End date");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function pickupVerificationMatches(order: OrderDetail, method: PickupVerificationMethod, value: string): boolean {
  if (method === PickupVerificationMethod.ORDER_NUMBER) return order.orderNumber.toLowerCase() === value.toLowerCase();
  if (method === PickupVerificationMethod.PHONE) return normalizePhone(order.customer.phone) === normalizePhone(value);
  return Boolean(order.pickupCode && order.pickupCode.toLowerCase() === value.toLowerCase());
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}
