import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ActorType,
  SourceApp,
  CustomerServiceCaseStatus,
  CustomerServiceIssueType,
  DeliveryRiderType,
  EmployeeStatus,
  FulfillmentExceptionReason,
  FulfillmentItemStatus,
  FulfillmentMethod,
  FulfillmentNodeStatus,
  FulfillmentNodeType,
  FulfillmentStatus,
  InventoryItemStatus,
  NotificationAudience,
  OrderStatus,
  PackagingMethod,
  PaymentStatus,
  PickupVerificationMethod,
  Prisma,
  RefundKind,
  closeUnpaidOrder,
  enqueueNotification,
  lockReservationOrder,
  lockOrderReservationInventory,
  orderRefundPosition,
  prisma,
  reverseCommissionForClosedOrder,
  writeOffPaidOrder,
  type InventoryOutcome
} from "@online-saler/database";
import {
  SUPPORT_PHONE_LABEL,
  isValidActualDeliveryCost,
  notificationBody,
  notificationDedupeKey,
  type NotificationTopicName
} from "@online-saler/business-rules";
import { OperationsAccessService } from "./operations-access.service";
import {
  buildPackageCode,
  canResolveFulfillmentException,
  canTransitionFulfillment,
  maskCustomerPhone,
  orderCenterTab,
  requiresNodeTransit,
  type OrderCenterTab,
  verifyFulfillmentItemBarcode
} from "./operations-fulfillment-state";
import { refreshWarehouseLocationStatuses } from "./warehouse-capacity";

const ORDER_INCLUDE = {
  customer: true,
  affiliate: true,
  fulfillmentNode: true,
  refunds: { orderBy: { recordedAt: "desc" } },
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
      fulfillmentNode: true,
      sentToNodeBy: true,
      arrivedAtNodeBy: true,
      deliveryCostBy: true,
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
    include: { assignedEmployee: true, createdByAdminUser: true, afterSaleReturn: { select: { id: true } } },
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
  /** Narrows the list to one store's packages, for the node workbench. */
  nodeId?: string;
  packageCode?: string;
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
export type NodeInput = AdminInput & { nodeId?: string };
export type DeliveryCostInput = AdminInput & { actualDeliveryCostKsh?: number };
export type WriteOffInput = AdminInput & { inventoryOutcome?: InventoryOutcome };
export type RefundInput = AdminInput & {
  amountKsh?: number;
  externalReference?: string;
  evidenceNote?: string;
  refundedAt?: string;
  reason?: string;
};
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
      "in-transit-to-node": 0,
      "at-node": 0,
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
      await lockReservationOrder(tx, orderId);
      const current = await tx.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
      if (!current) throw new NotFoundException("Order was not found.");
      if ((current.status !== OrderStatus.PAID && current.status !== OrderStatus.FULFILLING) || current.fulfillment?.status !== FulfillmentStatus.PICKING) {
        throw new ConflictException("Picking task changed. Refresh before scanning another item.");
      }
      if (current.fulfillment.assignedPickerEmployeeId && current.fulfillment.assignedPickerEmployeeId !== actor.actorEmployeeId) {
        throw new ForbiddenException("This picking task is assigned to another employee.");
      }
      const currentItem = current.fulfillment.items.find((item) => item.orderItemId === orderItemId);
      if (!currentItem) throw new NotFoundException("Order item was not found in this picking task.");
      if (currentItem.status === FulfillmentItemStatus.VERIFIED) return;
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
        await this.assertOwnedInventory(tx, orderId, current.items.length, InventoryItemStatus.PAID);
        const pickedInventory = await tx.inventoryItem.findMany({
          where: { productId: { in: order.items.map((item) => item.productId) } },
          select: { locationId: true }
        });
        await tx.orderFulfillment.update({
          where: { id: fulfillment.id },
          data: { status: FulfillmentStatus.READY_TO_PACK, pickedAt: new Date() }
        });
        const changed = await tx.inventoryItem.updateMany({
          where: { productId: { in: current.items.map((item) => item.productId) }, status: InventoryItemStatus.PAID },
          data: { status: InventoryItemStatus.PICKED }
        });
        if (changed.count !== current.items.length) throw new ConflictException("Inventory changed before picking completed.");
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
      await lockReservationOrder(tx, orderId);
      const current = await tx.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
      if (!current) throw new NotFoundException("Order was not found.");
      if ((current.status !== OrderStatus.PAID && current.status !== OrderStatus.FULFILLING) ||
        current.fulfillment?.status !== FulfillmentStatus.READY_TO_PACK ||
        current.fulfillment.updatedAt.getTime() !== fulfillment.updatedAt.getTime()) {
        throw new ConflictException("Order or packing task changed. Refresh before completing packing.");
      }
      await this.assertOwnedInventory(tx, orderId, current.items.length, InventoryItemStatus.PICKED);
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
      const changed = await tx.inventoryItem.updateMany({
        where: { productId: { in: current.items.map((item) => item.productId) }, status: InventoryItemStatus.PICKED },
        data: { status: InventoryItemStatus.PACKED }
      });
      if (changed.count !== current.items.length) throw new ConflictException("Inventory changed before packing completed.");
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
      await this.queueCustomerNotification(tx, orderId, "CUSTOMER_ORDER_DISPATCHED", {
        riderName: fulfillment.deliveryRiderName ?? fulfillment.deliveryRider?.name ?? null
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
        data: {
          status: FulfillmentStatus.EXCEPTION,
          exceptionReason: reason,
          exceptionNote: input.note?.trim() || null,
          // Keep the step the order was on so a resolved exception can rejoin it.
          exceptionFromStatus: fulfillment.status === FulfillmentStatus.EXCEPTION
            ? fulfillment.exceptionFromStatus
            : fulfillment.status,
          exceptionResolvedAt: null
        }
      });
      await this.queueAdminAlert(tx, order, "ADMIN_FULFILLMENT_EXCEPTION", `${reason}${input.note?.trim() ? `: ${input.note.trim()}` : ""}`);
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

  /**
   * Cancels an order that was never paid. The garment goes straight back on
   * sale: leaving the inventory row reserved, as this used to, took the item
   * out of circulation permanently because the expiry sweep skips an order that
   * is no longer waiting for payment.
   */
  async cancel(orderId: string, input: AdminInput) {
    const actor = await this.adminForPermission(input.adminUserId, "orders.cancel");
    await prisma.$transaction(async (tx) => {
      await lockReservationOrder(tx, orderId);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { fulfillment: true, payments: { where: { status: PaymentStatus.SUCCESS }, select: { id: true } } }
      });
      if (!order) throw new NotFoundException("Order was not found.");
      if (order.status === OrderStatus.CANCELLED) return;
      if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.REFUNDED || order.fulfillment?.status === FulfillmentStatus.COMPLETED) {
        throw new BadRequestException("Completed or refunded orders cannot be cancelled here.");
      }
      if (order.payments.length) {
        throw new BadRequestException("This order has been paid. Use write-off so the stock outcome and the refund are recorded.");
      }
      const reason = input.note?.trim() || "Order cancelled in the order centre.";
      const result = await closeUnpaidOrder(tx, orderId, actor.actorEmployeeId ?? null, reason);
      if (!result.changed) throw new ConflictException("Order state changed before cancellation. Refresh and try again.");
      if (order.fulfillment) {
        await tx.orderFulfillment.update({
          where: { id: order.fulfillment.id },
          data: {
            status: FulfillmentStatus.EXCEPTION,
            exceptionReason: FulfillmentExceptionReason.CUSTOMER_CANCELLED,
            exceptionNote: input.note?.trim() || null,
            exceptionFromStatus: order.fulfillment.status === FulfillmentStatus.EXCEPTION
              ? order.fulfillment.exceptionFromStatus
              : order.fulfillment.status
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
    const status = input.status && Object.values(CustomerServiceCaseStatus).includes(input.status) ? input.status : undefined;
    await prisma.$transaction(async (tx) => {
      // Share the order lock with case mutations, returns and commission transitions.
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { fulfillment: true } });
      if (!order) throw new NotFoundException("Order was not found.");
      const fulfillment = order.fulfillment;
      if (!fulfillment) throw new BadRequestException("After-sale ownership requires an order fulfillment record.");
      const existingCase = input.caseId ? await tx.customerServiceCase.findFirst({
        where: { id: input.caseId, orderId, issueType: CustomerServiceIssueType.AFTER_SALE },
        include: { afterSaleReturn: { select: { id: true } } }
      }) : null;
      if (input.caseId && !existingCase) throw new NotFoundException("After-sale case was not found for this order.");
      if (existingCase?.afterSaleReturn && [input.status, input.requiresReturn, input.requiresRefund, input.affectsAffiliateCommission].some((value) => value !== undefined)) {
        throw new BadRequestException("Use the return workflow to change this managed after-sale case status or return/refund flags.");
      }
      if (fulfillment.afterSaleOwnerEmployeeId === employee.id && !input.caseId) return;
      await tx.orderFulfillment.update({ where: { id: fulfillment.id }, data: { afterSaleOwnerEmployeeId: employee.id } });
      const updatedCase = existingCase ? await tx.customerServiceCase.update({
        where: { id: existingCase.id },
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
      }) : null;
      const action = input.caseId ? "UPDATE_AFTER_SALE_CASE" : "ASSIGN_AFTER_SALE_OWNER";
      await this.createEvent(tx, {
        idempotencyKey: `after-sale:${fulfillment.id}:${input.caseId ?? "order"}:${employee.id}:${status ?? "unchanged"}:${input.requiresReturn ?? "unchanged"}:${input.requiresRefund ?? "unchanged"}:${input.affectsAffiliateCommission ?? "unchanged"}:${input.afterSaleReason?.trim() ?? ""}:${input.customerRequest?.trim() ?? ""}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: employee.id,
        action,
        oldStatus: fulfillment.status,
        newStatus: fulfillment.status,
        note: input.note
      });
      // Keep each actual case change even when its fulfillment timeline key was seen before.
      await tx.auditLog.create({ data: {
        actorType: ActorType.EMPLOYEE, actorId: actor.actorEmployeeId,
        actorAdminUserId: actor.actorAdminUserId, sourceApp: SourceApp.OPERATIONS,
        module: "customer-service", entityType: input.caseId ? "CustomerServiceCase" : "OrderFulfillment",
        entityId: input.caseId ?? fulfillment.id, action,
        beforeJson: JSON.parse(JSON.stringify({ orderId, ownerEmployeeId: fulfillment.afterSaleOwnerEmployeeId, serviceCase: existingCase })),
        afterJson: JSON.parse(JSON.stringify({ orderId, ownerEmployeeId: employee.id, serviceCase: updatedCase })),
        reason: input.note?.trim() || input.afterSaleReason?.trim() || "After-sale ownership or case updated."
      } });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  /** Nodes a package can be routed to. */
  async nodes(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, "nodes.view");
    return prisma.fulfillmentNode.findMany({
      where: { status: FulfillmentNodeStatus.ACTIVE },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
  }

  /**
   * Routes an order to the node that will hand it to the customer. Pickup
   * orders arrive with the node the customer chose; delivery orders are routed
   * here, before the package leaves the warehouse.
   */
  async assignNode(orderId: string, input: NodeInput) {
    const actor = await this.adminForPermission(input.adminUserId, "orders.assign-node");
    const nodeId = input.nodeId?.trim();
    if (!nodeId) throw new BadRequestException("Choose a fulfillment node.");
    const node = await prisma.fulfillmentNode.findUnique({ where: { id: nodeId } });
    if (!node || node.status !== FulfillmentNodeStatus.ACTIVE) throw new BadRequestException("That fulfillment node is not active.");

    await prisma.$transaction(async (tx) => {
      await lockReservationOrder(tx, orderId);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { fulfillment: true } });
      if (!order) throw new NotFoundException("Order was not found.");
      if (!order.fulfillment) throw new BadRequestException("This order does not have a fulfillment task yet.");
      const settled: FulfillmentStatus[] = [
        FulfillmentStatus.IN_TRANSIT_TO_NODE,
        FulfillmentStatus.ARRIVED_AT_NODE,
        FulfillmentStatus.READY_FOR_PICKUP,
        FulfillmentStatus.READY_FOR_DISPATCH,
        FulfillmentStatus.OUT_FOR_DELIVERY,
        FulfillmentStatus.COMPLETED
      ];
      if (settled.includes(order.fulfillment.status)) {
        throw new BadRequestException("The package has already left the warehouse. Raise an exception instead of re-routing it.");
      }
      if (order.fulfillmentMethod === FulfillmentMethod.PICKUP && !node.supportsPickup) {
        throw new BadRequestException("That node does not accept customer pickup.");
      }
      if (order.fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY && !node.supportsDelivery) {
        throw new BadRequestException("That node does not dispatch deliveries.");
      }
      await tx.order.update({ where: { id: orderId }, data: { fulfillmentNodeId: node.id } });
      await tx.orderFulfillment.update({
        where: { id: order.fulfillment.id },
        data: { fulfillmentNodeId: node.id }
      });
      await this.createEvent(tx, {
        fulfillmentId: order.fulfillment.id,
        orderId,
        ...actor,
        action: "ASSIGN_FULFILLMENT_NODE",
        oldStatus: order.fulfillment.status,
        newStatus: order.fulfillment.status,
        note: `${node.name}${input.note?.trim() ? ` - ${input.note.trim()}` : ""}`
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  /**
   * Hands a packed order to the transfer run that takes it to its store node.
   * The package code is what the store scans in on arrival, so warehouse and
   * store are looking at the same label instead of arguing about a parcel.
   */
  async sendToNode(orderId: string, input: AdminInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.assign-node");
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status === FulfillmentStatus.IN_TRANSIT_TO_NODE) return this.orderDetail(orderId, input.adminUserId);
    const node = order.fulfillmentNode;
    if (!node) throw new BadRequestException("Route this order to a node before sending its package.");
    if (!requiresNodeTransit(node.type)) {
      throw new BadRequestException("Orders handed over at the warehouse do not need a transfer.");
    }
    this.assertTransition(order, FulfillmentStatus.IN_TRANSIT_TO_NODE);
    const packageCode = fulfillment.packageCode || buildPackageCode(order.orderNumber, node.code);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await lockReservationOrder(tx, orderId);
      const current = await tx.orderFulfillment.findUnique({ where: { id: fulfillment.id } });
      if (!current || current.status !== FulfillmentStatus.PACKED) {
        throw new ConflictException("Fulfillment state changed. Refresh before sending the package.");
      }
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: {
          status: FulfillmentStatus.IN_TRANSIT_TO_NODE,
          packageCode,
          sentToNodeByEmployeeId: actor.actorEmployeeId,
          sentToNodeAt: now
        }
      });
      await this.createEvent(tx, {
        idempotencyKey: `transition:${fulfillment.id}:${FulfillmentStatus.IN_TRANSIT_TO_NODE}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: actor.actorEmployeeId,
        action: "SEND_PACKAGE_TO_NODE",
        oldStatus: fulfillment.status,
        newStatus: FulfillmentStatus.IN_TRANSIT_TO_NODE,
        note: `${packageCode}${input.note?.trim() ? ` - ${input.note.trim()}` : ""}`
      });
      await this.queueNodeNotification(tx, order, "NODE_PACKAGE_IN_TRANSIT");
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  /**
   * The store confirms the package physically arrived. Without this record
   * there is no way to settle "the warehouse says it shipped, the store says it
   * never came".
   */
  async receiveAtNode(orderId: string, input: AdminInput & { packageCode?: string }) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.node-receive");
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status === FulfillmentStatus.ARRIVED_AT_NODE) return this.orderDetail(orderId, input.adminUserId);
    this.assertTransition(order, FulfillmentStatus.ARRIVED_AT_NODE);
    const scanned = input.packageCode?.trim().toUpperCase();
    if (scanned && fulfillment.packageCode && scanned !== fulfillment.packageCode.toUpperCase()) {
      throw new BadRequestException(`This package belongs to ${fulfillment.packageCode}. Check the label before receiving it.`);
    }
    await this.employeeBelongsToNode(actor.actorEmployeeId, fulfillment.fulfillmentNodeId);

    await prisma.$transaction(async (tx) => {
      await lockReservationOrder(tx, orderId);
      const current = await tx.orderFulfillment.findUnique({ where: { id: fulfillment.id } });
      if (!current || current.status !== FulfillmentStatus.IN_TRANSIT_TO_NODE) {
        throw new ConflictException("Fulfillment state changed. Refresh before receiving the package.");
      }
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: {
          status: FulfillmentStatus.ARRIVED_AT_NODE,
          arrivedAtNodeByEmployeeId: actor.actorEmployeeId,
          arrivedAtNodeAt: new Date(),
          nodeReceiptNote: input.note?.trim() || null
        }
      });
      await this.createEvent(tx, {
        idempotencyKey: `transition:${fulfillment.id}:${FulfillmentStatus.ARRIVED_AT_NODE}`,
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        relatedEmployeeId: actor.actorEmployeeId,
        action: "RECEIVE_PACKAGE_AT_NODE",
        oldStatus: fulfillment.status,
        newStatus: FulfillmentStatus.ARRIVED_AT_NODE,
        note: input.note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  /** Records the fare the node actually paid Bolt, against the KSh 50 the customer paid. */
  async recordDeliveryCost(orderId: string, input: DeliveryCostInput) {
    const actor = await this.employeeForPermission(input.adminUserId, "orders.delivery-cost");
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (order.fulfillmentMethod !== FulfillmentMethod.KIKUYU_LOCAL_DELIVERY) {
      throw new BadRequestException("Only delivery orders have a Bolt fare.");
    }
    const amount = Number(input.actualDeliveryCostKsh);
    if (!isValidActualDeliveryCost(amount)) {
      throw new BadRequestException("Enter the actual fare as a whole KSh amount.");
    }
    const dispatched: FulfillmentStatus[] = [
      FulfillmentStatus.OUT_FOR_DELIVERY,
      FulfillmentStatus.COMPLETED,
      FulfillmentStatus.EXCEPTION
    ];
    if (!dispatched.includes(fulfillment.status)) {
      throw new BadRequestException("Record the fare once the parcel has been handed to the rider.");
    }
    await this.employeeBelongsToNode(actor.actorEmployeeId, fulfillment.fulfillmentNodeId);
    await prisma.$transaction(async (tx) => {
      const before = await tx.orderFulfillment.findUnique({ where: { id: fulfillment.id } });
      if (!before) throw new NotFoundException("Fulfillment task was not found.");
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: {
          actualDeliveryCostKsh: amount,
          deliveryCostNote: input.note?.trim() || null,
          deliveryCostByEmployeeId: actor.actorEmployeeId,
          deliveryCostRecordedAt: new Date()
        }
      });
      await tx.auditLog.create({
        data: {
          actorType: ActorType.EMPLOYEE,
          actorId: actor.actorEmployeeId,
          actorAdminUserId: actor.actorAdminUserId,
          sourceApp: SourceApp.OPERATIONS,
          module: "ORDERS",
          entityType: "OrderFulfillment",
          entityId: fulfillment.id,
          action: "RECORD_DELIVERY_COST",
          beforeJson: { actualDeliveryCostKsh: before.actualDeliveryCostKsh },
          afterJson: { actualDeliveryCostKsh: amount, customerDeliveryFeeKsh: order.deliveryFeeKsh },
          reason: input.note?.trim() || "Bolt fare recorded after dispatch."
        }
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  /**
   * Returns an order from EXCEPTION to the step it was on. Without this an
   * exception is a dead end and the only way out is cancelling the order.
   */
  async resolveException(orderId: string, input: AdminInput) {
    const actor = await this.employeeForAnyPermission(input.adminUserId, ["orders.pick", "orders.pack", "orders.dispatch", "orders.node-receive"]);
    const order = await this.requireOrderWithTask(orderId);
    const fulfillment = order.fulfillment!;
    if (fulfillment.status !== FulfillmentStatus.EXCEPTION) return this.orderDetail(orderId, input.adminUserId);
    if (!canResolveFulfillmentException(fulfillment)) {
      throw new BadRequestException("This exception has no recorded step to return to. Write the order off instead.");
    }
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException("A cancelled or refunded order cannot re-enter fulfillment.");
    }
    const note = input.note?.trim();
    if (!note) throw new BadRequestException("Say what was resolved before returning the order to fulfillment.");
    const back = fulfillment.exceptionFromStatus!;

    await prisma.$transaction(async (tx) => {
      await lockReservationOrder(tx, orderId);
      const current = await tx.orderFulfillment.findUnique({ where: { id: fulfillment.id } });
      if (!current || current.status !== FulfillmentStatus.EXCEPTION) {
        throw new ConflictException("Fulfillment state changed. Refresh before resolving the exception.");
      }
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: {
          status: back,
          exceptionReason: null,
          exceptionNote: null,
          exceptionFromStatus: null,
          exceptionResolvedAt: new Date()
        }
      });
      await this.createEvent(tx, {
        fulfillmentId: fulfillment.id,
        orderId,
        ...actor,
        action: "RESOLVE_EXCEPTION",
        oldStatus: FulfillmentStatus.EXCEPTION,
        newStatus: back,
        note
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  /**
   * Writes off a paid order that can never be fulfilled - the garment was lost,
   * damaged, or already sold in a store. The stock outcome is explicit, the
   * commission is reversed, and the order is left owing a refund that finance
   * records separately once M-Pesa has actually sent the money back.
   */
  async writeOff(orderId: string, input: WriteOffInput) {
    const actor = await this.adminForPermission(input.adminUserId, "orders.write-off");
    const outcome: InventoryOutcome = input.inventoryOutcome === "RESTOCK" ? "RESTOCK" : "LOST";
    const note = input.note?.trim();
    if (!note) throw new BadRequestException("A write-off needs a reason on the record.");

    await prisma.$transaction(async (tx) => {
      await lockReservationOrder(tx, orderId);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { fulfillment: true, payments: { where: { status: PaymentStatus.SUCCESS }, select: { id: true } } }
      });
      if (!order) throw new NotFoundException("Order was not found.");
      if (!order.payments.length) throw new BadRequestException("This order was never paid. Cancel it instead of writing it off.");
      if (order.status === OrderStatus.COMPLETED) throw new BadRequestException("A completed order goes through after-sales, not write-off.");
      if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) return;

      const before = order.fulfillment?.status ?? null;
      const result = await writeOffPaidOrder(tx, orderId, outcome, actor.actorEmployeeId ?? null, `Order write-off: ${note}`);
      if (!result.changed) throw new ConflictException("Order state changed before write-off. Refresh and try again.");

      if (order.fulfillment) {
        await tx.orderFulfillment.update({
          where: { id: order.fulfillment.id },
          data: {
            status: FulfillmentStatus.EXCEPTION,
            exceptionReason: order.fulfillment.exceptionReason ?? FulfillmentExceptionReason.ITEM_NOT_FOUND,
            exceptionNote: note,
            exceptionFromStatus: null
          }
        });
        await this.createEvent(tx, {
          idempotencyKey: `write-off:${order.fulfillment.id}`,
          fulfillmentId: order.fulfillment.id,
          orderId,
          ...actor,
          action: "WRITE_OFF_ORDER",
          oldStatus: before,
          newStatus: FulfillmentStatus.EXCEPTION,
          note: `${outcome === "RESTOCK" ? "Item returned to stock" : "Item written off as lost"} - ${note}`
        });
      }
      await tx.auditLog.create({
        data: {
          actorType: ActorType.EMPLOYEE,
          actorId: actor.actorEmployeeId,
          actorAdminUserId: actor.actorAdminUserId,
          sourceApp: SourceApp.OPERATIONS,
          module: "ORDERS",
          entityType: "Order",
          entityId: orderId,
          action: "WRITE_OFF_ORDER",
          beforeJson: { orderStatus: order.status, fulfillmentStatus: before },
          afterJson: {
            orderStatus: OrderStatus.CANCELLED,
            inventoryOutcome: outcome,
            restockedItems: result.restockedItems,
            lostItems: result.lostItems
          },
          reason: note
        }
      });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  /**
   * Records a refund that has already been executed in M-Pesa. Like the
   * after-sales path, this books money that moved outside the system; it never
   * moves money itself.
   */
  async recordRefund(orderId: string, input: RefundInput) {
    const actor = await this.adminForPermission(input.adminUserId, "orders.refund");
    const amount = Number(input.amountKsh);
    const externalReference = input.externalReference?.trim();
    const evidenceNote = input.evidenceNote?.trim() || input.note?.trim();
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException("Refund amount must be a positive whole KSh amount.");
    if (!externalReference) throw new BadRequestException("Enter the M-Pesa reversal or payout reference.");
    if (!evidenceNote) throw new BadRequestException("Describe the evidence for this refund.");
    const refundedAt = input.refundedAt ? validDate(input.refundedAt, "Refund date") : new Date();

    await prisma.$transaction(async (tx) => {
      await lockReservationOrder(tx, orderId);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { payments: true, refunds: true }
      });
      if (!order) throw new NotFoundException("Order was not found.");
      const position = orderRefundPosition(order);
      if (!position.paidKsh) throw new BadRequestException("This order has no successful payment to refund.");
      if (amount > position.outstandingKsh) {
        throw new BadRequestException(`Recorded refunds would exceed the KSh ${position.paidKsh} actually paid.`);
      }
      await tx.refundRecord.create({
        data: {
          orderId,
          kind: RefundKind.UNFULFILLABLE_ORDER,
          reason: input.reason?.trim() || null,
          amountKsh: amount,
          externalReference,
          evidenceNote,
          refundedAt,
          recordedByAdminUserId: actor.actorAdminUserId!
        }
      });
      const refundedKsh = position.refundedKsh + amount;
      if (refundedKsh >= position.paidKsh) {
        await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.REFUNDED } });
        await reverseCommissionForClosedOrder(tx, orderId, "ORDER_REFUNDED");
      }
      await tx.auditLog.create({
        data: {
          actorType: ActorType.EMPLOYEE,
          actorId: actor.actorEmployeeId,
          actorAdminUserId: actor.actorAdminUserId,
          sourceApp: SourceApp.OPERATIONS,
          module: "ORDERS",
          entityType: "Order",
          entityId: orderId,
          action: "RECORD_ORDER_REFUND",
          beforeJson: { refundedKsh: position.refundedKsh, paidKsh: position.paidKsh },
          afterJson: { refundedKsh, paidKsh: position.paidKsh, externalReference },
          reason: evidenceNote
        }
      });
      await this.queueCustomerNotification(tx, orderId, "CUSTOMER_REFUND_RECORDED", { amountKsh: amount });
    });
    return this.orderDetail(orderId, input.adminUserId);
  }

  /** Store staff may only receive packages addressed to their own node. */
  private async employeeBelongsToNode(employeeId: string | null | undefined, nodeId: string | null) {
    if (!employeeId || !nodeId) return;
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { homeNodeId: true } });
    // Warehouse and head-office staff have no home node and can act anywhere.
    if (!employee?.homeNodeId || employee.homeNodeId === nodeId) return;
    throw new ForbiddenException("This package is addressed to a different node.");
  }

  /**
   * Queues a message for the shopper. It is written inside the same
   * transaction as the state change that earned it, so a provider outage can
   * never roll back a fulfillment transition and a retried transition can never
   * send the message twice.
   */
  private async queueCustomerNotification(
    tx: Prisma.TransactionClient,
    orderId: string,
    topic: NotificationTopicName,
    extra: { amountKsh?: number | null; riderName?: string | null } = {}
  ) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { customer: true, fulfillmentNode: true, items: { select: { id: true } } }
    });
    if (!order) return;
    await enqueueNotification(tx, {
      topic,
      audience: NotificationAudience.CUSTOMER,
      dedupeKey: notificationDedupeKey(topic, orderId),
      recipientPhone: order.whatsappPhone || order.customer.phone,
      recipientLabel: order.customer.displayName ?? null,
      orderId,
      fulfillmentNodeId: order.fulfillmentNodeId,
      body: notificationBody(topic, {
        orderNumber: order.orderNumber,
        customerName: order.customer.displayName,
        nodeName: order.fulfillmentNode?.name ?? null,
        nodeMapsUrl: order.fulfillmentNode?.mapsUrl ?? null,
        itemCount: order.items.length,
        amountKsh: extra.amountKsh ?? null,
        riderName: extra.riderName ?? null,
        pickupCode: order.pickupCode,
        supportPhone: SUPPORT_PHONE_LABEL
      })
    });
  }

  /** Tells the store a package is coming or is waiting for a rider. */
  private async queueNodeNotification(
    tx: Prisma.TransactionClient,
    order: OrderDetail,
    topic: NotificationTopicName
  ) {
    const node = order.fulfillmentNode;
    if (!node?.phone) return;
    await enqueueNotification(tx, {
      topic,
      audience: NotificationAudience.NODE,
      dedupeKey: notificationDedupeKey(topic, order.id),
      recipientPhone: node.phone,
      recipientLabel: node.name,
      orderId: order.id,
      fulfillmentNodeId: node.id,
      body: notificationBody(topic, {
        orderNumber: order.orderNumber,
        nodeName: node.name,
        itemCount: order.items.length
      })
    });
  }

  /**
   * Alerts whoever is on duty. The numbers come from ADMIN_ALERT_PHONES so the
   * on-call list can change without a deploy; with none set the alert is simply
   * not queued and the exception still shows in the order centre.
   */
  private async queueAdminAlert(
    tx: Prisma.TransactionClient,
    order: { id: string; orderNumber: string },
    topic: NotificationTopicName,
    reason: string
  ) {
    const phones = (process.env.ADMIN_ALERT_PHONES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    for (const phone of phones) {
      await enqueueNotification(tx, {
        topic,
        audience: NotificationAudience.ADMIN,
        dedupeKey: notificationDedupeKey(topic, `${order.id}:${phone}:${reason}`),
        recipientPhone: phone,
        orderId: order.id,
        body: notificationBody(topic, { orderNumber: order.orderNumber, reason })
      });
    }
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
      if (status === FulfillmentStatus.READY_FOR_PICKUP) {
        await this.queueCustomerNotification(tx, orderId, "CUSTOMER_ORDER_READY_FOR_PICKUP");
      }
      if (status === FulfillmentStatus.READY_FOR_DISPATCH) {
        await this.queueNodeNotification(tx, order, "NODE_PACKAGE_AWAITING_DISPATCH");
      }
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
    await prisma.$transaction(async (tx) => {
      await lockReservationOrder(tx, order.id);
      const current = await tx.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
      if (!current) throw new NotFoundException("Order was not found.");
      // A delayed completion retry must not touch a refunded/relisted garment or reset the return window.
      if (current.status === OrderStatus.COMPLETED || current.status === OrderStatus.REFUNDED) return;
      if (current.status !== OrderStatus.PAID && current.status !== OrderStatus.FULFILLING) throw new ConflictException("Order state changed before handover. Refresh before continuing.");
      this.assertTransition(current, FulfillmentStatus.COMPLETED);
      const fulfillment = current.fulfillment!;
      const successfulPayments = await tx.payment.findMany({ where: { orderId: current.id, status: PaymentStatus.SUCCESS }, select: { amountKsh: true } });
      if (successfulPayments.reduce((sum, payment) => sum + payment.amountKsh, 0) < current.totalKsh) throw new BadRequestException("Verified successful payment must cover the order before handover.");
      await this.assertOwnedInventory(tx, current.id, current.items.length, InventoryItemStatus.PACKED);
      const changed = await tx.inventoryItem.updateMany({
        where: { productId: { in: current.items.map((item) => item.productId) }, status: InventoryItemStatus.PACKED },
        data: { status: InventoryItemStatus.DELIVERED }
      });
      if (changed.count !== current.items.length) throw new ConflictException("Inventory changed before handover. Refresh and check the actual parcel.");
      await tx.order.update({ where: { id: current.id }, data: { status: OrderStatus.COMPLETED } });
      await tx.orderFulfillment.update({
        where: { id: fulfillment.id },
        data: { ...fulfillmentData, status: FulfillmentStatus.COMPLETED, completedAt: new Date() }
      });
      await this.createEvent(tx, {
        idempotencyKey: `transition:${fulfillment.id}:${FulfillmentStatus.COMPLETED}`,
        fulfillmentId: fulfillment.id,
        orderId: current.id,
        ...actor,
        action,
        oldStatus: fulfillment.status,
        newStatus: FulfillmentStatus.COMPLETED,
        note
      });
      await this.queueCustomerNotification(tx, current.id, "CUSTOMER_ORDER_COMPLETED");
    });
  }

  private async assertOwnedInventory(tx: Prisma.TransactionClient, orderId: string, itemCount: number, expected: InventoryItemStatus) {
    const inventory = await lockOrderReservationInventory(tx, orderId);
    if (!itemCount || inventory.length !== itemCount || inventory.some((item) => !item.owned || item.status !== expected)) {
      throw new ConflictException("Inventory is no longer owned by this order in the expected fulfillment state.");
    }
    const otherPaidOrder = await tx.orderItem.findFirst({ where: {
      productId: { in: inventory.map((item) => item.productId) }, orderId: { not: orderId },
      order: { status: { in: [OrderStatus.PAID, OrderStatus.FULFILLING] } }
    }, select: { id: true } });
    if (otherPaidOrder) throw new ConflictException("A different paid order claims this inventory. Review ownership before continuing.");
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
    if (input.customerPhone?.trim()) and.push({ payments: { some: { phone: { contains: input.customerPhone.trim(), mode: "insensitive" } } } });
    if (input.productName?.trim()) and.push({ items: { some: { snapshot: { is: { title: { contains: input.productName.trim(), mode: "insensitive" } } } } } });
    if (input.barcode?.trim()) and.push({ items: { some: { snapshot: { is: { barcode: { contains: input.barcode.trim(), mode: "insensitive" } } } } } });
    if (input.fulfillmentMethod && Object.values(FulfillmentMethod).includes(input.fulfillmentMethod)) and.push({ fulfillmentMethod: input.fulfillmentMethod });
    if (input.paymentStatus && Object.values(PaymentStatus).includes(input.paymentStatus)) and.push({ payments: { some: { status: input.paymentStatus } } });
    if (input.orderStatus && Object.values(OrderStatus).includes(input.orderStatus)) and.push({ status: input.orderStatus });
    if (input.nodeId?.trim()) and.push({ fulfillment: { is: { fulfillmentNodeId: input.nodeId.trim() } } });
    if (input.packageCode?.trim()) and.push({ fulfillment: { is: { packageCode: { contains: input.packageCode.trim(), mode: "insensitive" } } } });
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
      hasDeliveryRider: Boolean(fulfillment.deliveryRiderId),
      nodeType: nodeTypeFor(order)
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
              select: { id: true, publicUrl: true }
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
          displayImageUrl: item.snapshot?.imageUrl || currentImage?.publicUrl || (currentImage ? `/products/${item.productId}/images/${currentImage.id}/content` : null),
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
  if (tab === "in-transit-to-node") return { fulfillment: { is: { status: FulfillmentStatus.IN_TRANSIT_TO_NODE } } };
  if (tab === "at-node") return { fulfillment: { is: { status: FulfillmentStatus.ARRIVED_AT_NODE } } };
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

function nodeTypeFor(order: {
  fulfillmentNode?: { type: FulfillmentNodeType } | null;
  fulfillment?: { fulfillmentNode?: { type: FulfillmentNodeType } | null } | null;
}): FulfillmentNodeType | null {
  return order.fulfillment?.fulfillmentNode?.type ?? order.fulfillmentNode?.type ?? null;
}
