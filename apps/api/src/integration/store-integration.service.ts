import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  DeliveryRiderType,
  FulfillmentMethod,
  FulfillmentNodeStatus,
  FulfillmentStatus,
  prisma
} from "@online-saler/database";
import {
  OperationsFulfillmentService,
  type DeliveryFailureInput
} from "../operations/operations-fulfillment.service";
import { readStoreIntegrationActor, storeActorNote } from "./store-integration-auth";

/**
 * Online-order fulfillment, as the store ERP sees it.
 *
 * The stores already run their day inside FW-ERP. Asking a clerk to hold a
 * second app in their other hand to receive an online parcel is how parcels sit
 * unscanned, so this exposes the four things a store actually does with an
 * online order — receive it, hand it to a rider, hand it to the customer, take
 * it back after a failed delivery — and nothing else.
 *
 * ## What a store may touch
 *
 * The store code in the path is the only thing that decides scope, and it comes
 * from the store ERP's own session, not from a clerk's input. Every read filters
 * by the node it maps to, and every write re-checks that the package still
 * belongs to that node before delegating. A clerk in Utawala cannot see, let
 * alone close, a Kinoo parcel — even by typing its order id.
 *
 * ## What it deliberately does not expose
 *
 * No money: no order total, no delivery fee, no commission, no product cost. A
 * store receiving a parcel has no business knowing what the affiliate earned on
 * it. No delivery code either, in either direction — there is none to expose,
 * only a hash, and the whole point is that the digits live on the customer's
 * phone.
 */

/** The statuses a store can act on, in the order the shop floor meets them. */
const INCOMING_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.IN_TRANSIT_TO_NODE,
  FulfillmentStatus.RETURNING_TO_NODE
];
const AT_STORE_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.ARRIVED_AT_NODE,
  FulfillmentStatus.READY_FOR_DISPATCH,
  FulfillmentStatus.READY_FOR_PICKUP
];
const IN_FLIGHT_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.OUT_FOR_DELIVERY,
  FulfillmentStatus.DELIVERY_FAILED
];

export type StoreIntegrationInput = {
  storeCode: string;
  staffName?: string | null;
  staffId?: string | null;
  note?: string | null;
};

export type StoreReceiveInput = StoreIntegrationInput & { packageCode?: string };
export type StoreDispatchInput = StoreIntegrationInput & { deliveryRiderId?: string };
export type StorePickupInput = StoreIntegrationInput & { pickupCode?: string };

@Injectable()
export class StoreIntegrationService {
  constructor(private readonly fulfillment: OperationsFulfillmentService) {}

  /**
   * The service account these calls act as. One account, not one per store,
   * because the store scoping above is what protects the boundary and a single
   * account is one thing to rotate rather than six.
   */
  private async serviceAdminUserId(): Promise<string> {
    const login = process.env.STORE_INTEGRATION_ADMIN_LOGIN?.trim().toLowerCase();
    if (!login) {
      throw new BadRequestException("STORE_INTEGRATION_ADMIN_LOGIN is not configured on this environment.");
    }
    const adminUser = await prisma.adminUser.findUnique({ where: { loginAccount: login }, select: { id: true } });
    if (!adminUser) {
      throw new BadRequestException(`The store integration account ${login} does not exist. Create it in Accounts first.`);
    }
    return adminUser.id;
  }

  /** Resolves the store ERP's store code to the fulfillment node it is. */
  private async requireNode(storeCode: string) {
    const code = storeCode?.trim().toLowerCase();
    if (!code) throw new BadRequestException("A store code is required.");
    const node = await prisma.fulfillmentNode.findUnique({ where: { code } });
    if (!node) throw new NotFoundException(`No fulfillment node is mapped to the store code ${code}.`);
    if (node.status !== FulfillmentNodeStatus.ACTIVE) {
      throw new ForbiddenException(`${node.name} is not an active fulfillment node.`);
    }
    return node;
  }

  /**
   * Loads one package and proves it belongs to the calling store before anything
   * is done to it. Every write goes through here, so "this store owns this
   * parcel" is checked once, in one place, rather than per endpoint.
   */
  private async requireOwnPackage(storeCode: string, orderId: string) {
    const node = await this.requireNode(storeCode);
    const fulfillment = await prisma.orderFulfillment.findUnique({
      where: { orderId },
      select: { id: true, fulfillmentNodeId: true, status: true }
    });
    if (!fulfillment) throw new NotFoundException("This order has no fulfillment task.");
    if (fulfillment.fulfillmentNodeId !== node.id) {
      // Deliberately the same message as a missing parcel: a wrong store learns
      // nothing about whether the order exists.
      throw new NotFoundException("This package does not belong to your store.");
    }
    return { node, fulfillment };
  }

  /** Everything this store has to deal with, in the three piles it thinks in. */
  async board(storeCode: string) {
    const node = await this.requireNode(storeCode);
    const orders = await prisma.order.findMany({
      where: {
        fulfillment: {
          is: {
            fulfillmentNodeId: node.id,
            status: { in: [...INCOMING_STATUSES, ...AT_STORE_STATUSES, ...IN_FLIGHT_STATUSES] }
          }
        }
      },
      select: STORE_ORDER_SELECT,
      orderBy: { createdAt: "asc" }
    });

    const rows = orders.map((order) => this.view(order));
    const inStatus = (statuses: FulfillmentStatus[]) =>
      rows.filter((row) => statuses.includes(row.status as FulfillmentStatus));

    return {
      store: { code: node.code, name: node.name, nodeId: node.id },
      counts: {
        incoming: inStatus(INCOMING_STATUSES).length,
        awaitingDispatch: rows.filter((row) => row.status === FulfillmentStatus.ARRIVED_AT_NODE && row.isDelivery).length
          + rows.filter((row) => row.status === FulfillmentStatus.READY_FOR_DISPATCH).length,
        awaitingPickup: rows.filter((row) => row.status === FulfillmentStatus.READY_FOR_PICKUP).length,
        outForDelivery: rows.filter((row) => row.status === FulfillmentStatus.OUT_FOR_DELIVERY).length,
        deliveryFailed: rows.filter((row) => row.status === FulfillmentStatus.DELIVERY_FAILED).length
      },
      incoming: inStatus(INCOMING_STATUSES),
      atStore: inStatus(AT_STORE_STATUSES),
      inFlight: inStatus(IN_FLIGHT_STATUSES)
    };
  }

  /**
   * Finds a package by the code printed on it. The store scans rather than
   * searches, so a wrong-store scan has to say so plainly instead of returning
   * nothing — a clerk holding a real parcel needs to know it is in the wrong
   * building, not that the scan failed.
   */
  async scan(storeCode: string, packageCode: string) {
    const node = await this.requireNode(storeCode);
    const code = packageCode?.trim().toUpperCase();
    if (!code) throw new BadRequestException("Scan or type the package code.");
    const order = await prisma.order.findFirst({
      where: { fulfillment: { is: { packageCode: code } } },
      select: STORE_ORDER_SELECT
    });
    if (!order?.fulfillment) throw new NotFoundException(`No package is labelled ${code}.`);
    if (order.fulfillment.fulfillmentNodeId !== node.id) {
      return {
        ok: false as const,
        reason: "WRONG_NODE" as const,
        message: `This package belongs to ${order.fulfillment.fulfillmentNode?.name ?? "another store"}, not ${node.name}. Do not receive it.`,
        expectedStoreName: order.fulfillment.fulfillmentNode?.name ?? null
      };
    }
    return { ok: true as const, package: this.view(order) };
  }

  /** The riders this store may hand a parcel to. */
  async riders(storeCode: string) {
    const node = await this.requireNode(storeCode);
    const riders = await prisma.deliveryRider.findMany({
      where: { fulfillmentNodeId: node.id, active: true, type: DeliveryRiderType.INTERNAL },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" }
    });
    return riders;
  }

  async receive(orderId: string, input: StoreReceiveInput) {
    const { node } = await this.requireOwnPackage(input.storeCode, orderId);
    const actor = readStoreIntegrationActor(input);
    const adminUserId = await this.serviceAdminUserId();
    await this.fulfillment.receiveAtNode(orderId, {
      adminUserId,
      note: storeActorNote(actor, node.code, input.note),
      packageCode: input.packageCode
    });
    return this.one(orderId);
  }

  async dispatch(orderId: string, input: StoreDispatchInput) {
    const { node } = await this.requireOwnPackage(input.storeCode, orderId);
    const actor = readStoreIntegrationActor(input);
    // A store may only choose from its own riders; the service re-checks too.
    const riderId = input.deliveryRiderId?.trim();
    if (!riderId) throw new BadRequestException("Choose a rider.");
    const rider = await prisma.deliveryRider.findFirst({
      where: { id: riderId, fulfillmentNodeId: node.id, active: true },
      select: { id: true }
    });
    if (!rider) throw new BadRequestException("That rider does not ride for your store, or is off duty.");

    const adminUserId = await this.serviceAdminUserId();
    await this.fulfillment.dispatchToRider(orderId, {
      adminUserId,
      deliveryRiderId: riderId,
      note: storeActorNote(actor, node.code, input.note)
    });
    return this.one(orderId);
  }

  /**
   * The customer collects at the counter. The clerk types the code the customer
   * reads out; there is no route here that completes a pickup without one.
   */
  async pickup(orderId: string, input: StorePickupInput) {
    const { node } = await this.requireOwnPackage(input.storeCode, orderId);
    const actor = readStoreIntegrationActor(input);
    const adminUserId = await this.serviceAdminUserId();
    await this.fulfillment.confirmPickup(orderId, {
      adminUserId,
      verificationValue: input.pickupCode,
      note: storeActorNote(actor, node.code, input.note)
    });
    return this.one(orderId);
  }

  /** The rider brought a failed delivery back and the store takes it in. */
  async confirmReturn(orderId: string, input: StoreIntegrationInput) {
    const { node } = await this.requireOwnPackage(input.storeCode, orderId);
    const actor = readStoreIntegrationActor(input);
    const adminUserId = await this.serviceAdminUserId();
    await this.fulfillment.confirmReturnAtNode(orderId, {
      adminUserId,
      note: storeActorNote(actor, node.code, input.note)
    });
    return this.one(orderId);
  }

  /** Records a failed delivery reported at the counter rather than on the bike. */
  async markFailed(orderId: string, input: StoreIntegrationInput & { reason?: DeliveryFailureInput["reason"] }) {
    const { node } = await this.requireOwnPackage(input.storeCode, orderId);
    const actor = readStoreIntegrationActor(input);
    const adminUserId = await this.serviceAdminUserId();
    await this.fulfillment.markDeliveryFailed(orderId, {
      adminUserId,
      reason: input.reason,
      note: storeActorNote(actor, node.code, input.note)
    });
    return this.one(orderId);
  }

  private async one(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: STORE_ORDER_SELECT });
    if (!order) throw new NotFoundException("Order was not found.");
    return this.view(order);
  }

  /**
   * Exactly what a store clerk needs and nothing more. Declared as an explicit
   * projection rather than a spread, so a money column added to Order later
   * cannot quietly start appearing on a shop floor screen.
   */
  private view(order: StoreOrderRow) {
    const fulfillment = order.fulfillment!;
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      packageCode: fulfillment.packageCode,
      status: fulfillment.status,
      isDelivery: order.fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY,
      itemCount: order.items.length,
      items: order.items.map((item) => ({
        title: item.snapshot?.title ?? "Item",
        sizeLabel: item.snapshot?.sizeLabel ?? null
      })),
      customerName: order.customer.displayName,
      // The counter needs to phone the customer; the full number is the point.
      customerPhone: order.customer.phone,
      // Deprecated alias, kept so the store ERP's existing parser does not break.
      // It carried a masked number until 2026-09-24, when the owner removed
      // customer-info masking; it now carries the same full number as
      // customerPhone. Read customerPhone -- this field will be dropped once
      // FW-ERP no longer reads it.
      maskedCustomerPhone: order.customer.phone,
      deliveryAddress: order.deliveryAddress,
      deliveryNote: order.deliveryNote,
      riderName: fulfillment.deliveryRiderName,
      sentToNodeAt: fulfillment.sentToNodeAt,
      arrivedAtNodeAt: fulfillment.arrivedAtNodeAt,
      outForDeliveryAt: fulfillment.outForDeliveryAt,
      deliveryAttemptCount: fulfillment.deliveryAttemptCount,
      deliveryFailureReason: fulfillment.deliveryFailureReason,
      codeLocked: Boolean(fulfillment.customerCodeLockedAt)
    };
  }
}

const STORE_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  fulfillmentMethod: true,
  deliveryAddress: true,
  deliveryNote: true,
  createdAt: true,
  customer: { select: { displayName: true, phone: true } },
  items: { select: { snapshot: { select: { title: true, sizeLabel: true } } }, orderBy: { createdAt: "asc" } },
  fulfillment: {
    select: {
      packageCode: true,
      status: true,
      fulfillmentNodeId: true,
      deliveryRiderName: true,
      sentToNodeAt: true,
      arrivedAtNodeAt: true,
      outForDeliveryAt: true,
      deliveryAttemptCount: true,
      deliveryFailureReason: true,
      customerCodeLockedAt: true,
      fulfillmentNode: { select: { name: true } }
    }
  }
} as const;

type StoreOrderRow = {
  id: string;
  orderNumber: string;
  fulfillmentMethod: FulfillmentMethod;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  customer: { displayName: string | null; phone: string | null };
  items: ReadonlyArray<{ snapshot: { title: string; sizeLabel: string | null } | null }>;
  fulfillment: {
    packageCode: string | null;
    status: FulfillmentStatus;
    fulfillmentNodeId: string | null;
    deliveryRiderName: string | null;
    sentToNodeAt: Date | null;
    arrivedAtNodeAt: Date | null;
    outForDeliveryAt: Date | null;
    deliveryAttemptCount: number;
    deliveryFailureReason: string | null;
    customerCodeLockedAt: Date | null;
    fulfillmentNode: { name: string } | null;
  } | null;
};
