import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ActorType,
  EmployeeStatus,
  FulfillmentNodeStatus,
  FulfillmentNodeType,
  FulfillmentStatus,
  Prisma,
  SourceApp,
  prisma
} from "@online-saler/database";
import { normalizeNotificationPhone } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";

/**
 * Fulfillment node configuration. The five stores used to exist only as a
 * hard-coded array on the checkout page, which meant opening a sixth node, or
 * fixing a store's phone number, needed a deploy.
 */

export type NodeInput = {
  adminUserId?: string;
  code?: string;
  name?: string;
  type?: FulfillmentNodeType;
  status?: FulfillmentNodeStatus;
  supportsPickup?: boolean;
  supportsDelivery?: boolean;
  mapsUrl?: string;
  address?: string;
  phone?: string;
  sortOrder?: number;
  note?: string;
};

export type NodeStaffInput = {
  adminUserId?: string;
  employeeId?: string;
  nodeId?: string | null;
};

const OPEN_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.PAID,
  FulfillmentStatus.PICKING,
  FulfillmentStatus.READY_TO_PACK,
  FulfillmentStatus.PACKED,
  FulfillmentStatus.IN_TRANSIT_TO_NODE,
  FulfillmentStatus.ARRIVED_AT_NODE,
  FulfillmentStatus.READY_FOR_PICKUP,
  FulfillmentStatus.READY_FOR_DISPATCH,
  FulfillmentStatus.OUT_FOR_DELIVERY
];

@Injectable()
export class OperationsNodeAdminService {
  constructor(private readonly access: OperationsAccessService) {}

  async list(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, "nodes.view");
    const nodes = await prisma.fulfillmentNode.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        staff: {
          where: { status: EmployeeStatus.ACTIVE },
          select: { id: true, name: true, employeeCode: true },
          orderBy: { name: "asc" }
        },
        _count: { select: { orders: true } }
      }
    });
    const openCounts = await prisma.orderFulfillment.groupBy({
      by: ["fulfillmentNodeId"],
      where: { status: { in: OPEN_STATUSES }, fulfillmentNodeId: { not: null } },
      _count: true
    });
    const openByNode = new Map(openCounts.map((row) => [row.fulfillmentNodeId, row._count]));
    return nodes.map((node) => ({
      ...node,
      openPackages: openByNode.get(node.id) ?? 0,
      // A node with no phone number cannot be told a package is coming.
      reachable: Boolean(node.phone)
    }));
  }

  /** Employees who can be given a home node, with their current one. */
  async staff(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, "nodes.view");
    return prisma.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE },
      select: { id: true, name: true, employeeCode: true, homeNodeId: true, homeNode: { select: { name: true } } },
      orderBy: { name: "asc" }
    });
  }

  async create(input: NodeInput) {
    const actor = await this.actor(input.adminUserId);
    const code = normalizeCode(input.code);
    const name = input.name?.trim();
    if (!code) throw new BadRequestException("A node needs a short code, for example kinoo.");
    if (!name) throw new BadRequestException("A node needs a name.");
    const existing = await prisma.fulfillmentNode.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`A node with the code ${code} already exists.`);

    const node = await prisma.fulfillmentNode.create({ data: nodeData(input, { code, name }) });
    await this.audit(actor, node.id, "CREATE_FULFILLMENT_NODE", {}, node, input.note?.trim() || "New fulfillment node.");
    return node;
  }

  async update(nodeId: string, input: NodeInput) {
    const actor = await this.actor(input.adminUserId);
    const before = await prisma.fulfillmentNode.findUnique({ where: { id: nodeId } });
    if (!before) throw new NotFoundException("Node was not found.");
    if (input.status === FulfillmentNodeStatus.INACTIVE) {
      const open = await prisma.orderFulfillment.count({
        where: { fulfillmentNodeId: nodeId, status: { in: OPEN_STATUSES } }
      });
      if (open) throw new ConflictException(`${open} package(s) are still open at this node. Clear them before closing it.`);
    }
    const node = await prisma.fulfillmentNode.update({
      where: { id: nodeId },
      data: nodeData(input, { name: input.name?.trim() || before.name })
    });
    await this.audit(actor, nodeId, "UPDATE_FULFILLMENT_NODE", before, node, input.note?.trim() || "Node configuration changed.");
    return node;
  }

  /**
   * Gives an employee a home node. Store staff only see and act on packages
   * addressed to their own store; warehouse and head-office staff keep no home
   * node and can act anywhere.
   */
  async assignStaff(input: NodeStaffInput) {
    const actor = await this.actor(input.adminUserId);
    const employeeId = input.employeeId?.trim();
    if (!employeeId) throw new BadRequestException("Choose an employee.");
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException("Employee was not found.");
    const nodeId = input.nodeId?.trim() || null;
    if (nodeId) {
      const node = await prisma.fulfillmentNode.findUnique({ where: { id: nodeId } });
      if (!node) throw new NotFoundException("Node was not found.");
    }
    const updated = await prisma.employee.update({ where: { id: employeeId }, data: { homeNodeId: nodeId } });
    await this.audit(
      actor,
      employeeId,
      "ASSIGN_EMPLOYEE_NODE",
      { homeNodeId: employee.homeNodeId },
      { homeNodeId: nodeId },
      nodeId ? "Employee assigned to a fulfillment node." : "Employee no longer belongs to a node.",
      "Employee"
    );
    return updated;
  }

  private async actor(adminUserId?: string) {
    const session = await this.access.requirePermission(adminUserId, "nodes.manage");
    const adminUser = session.adminUser;
    if (!adminUser) throw new ForbiddenException("This action requires an admin account.");
    return { actorAdminUserId: adminUser.id, actorEmployeeId: adminUser.linkedEmployee?.id ?? null };
  }

  private async audit(
    actor: { actorAdminUserId: string; actorEmployeeId: string | null },
    entityId: string,
    action: string,
    beforeJson: unknown,
    afterJson: unknown,
    reason: string,
    entityType = "FulfillmentNode"
  ) {
    await prisma.auditLog.create({
      data: {
        actorType: ActorType.EMPLOYEE,
        actorId: actor.actorEmployeeId,
        actorAdminUserId: actor.actorAdminUserId,
        sourceApp: SourceApp.OPERATIONS,
        module: "SYSTEM",
        entityType,
        entityId,
        action,
        beforeJson: json(beforeJson),
        afterJson: json(afterJson),
        reason
      }
    });
  }
}

function nodeData(input: NodeInput, fixed: { code?: string; name: string }): Prisma.FulfillmentNodeUncheckedCreateInput {
  const phone = input.phone === undefined ? undefined : normalizeNotificationPhone(input.phone);
  if (input.phone?.trim() && !phone) {
    throw new BadRequestException("Enter the store phone as a Kenyan mobile number, for example 0712345678.");
  }
  return {
    ...(fixed.code ? { code: fixed.code } : {}),
    name: fixed.name,
    ...(input.type && Object.values(FulfillmentNodeType).includes(input.type) ? { type: input.type } : {}),
    ...(input.status && Object.values(FulfillmentNodeStatus).includes(input.status) ? { status: input.status } : {}),
    ...(typeof input.supportsPickup === "boolean" ? { supportsPickup: input.supportsPickup } : {}),
    ...(typeof input.supportsDelivery === "boolean" ? { supportsDelivery: input.supportsDelivery } : {}),
    ...(input.mapsUrl !== undefined ? { mapsUrl: input.mapsUrl.trim() || null } : {}),
    ...(input.address !== undefined ? { address: input.address.trim() || null } : {}),
    ...(input.phone !== undefined ? { phone } : {}),
    ...(Number.isSafeInteger(input.sortOrder) ? { sortOrder: input.sortOrder as number } : {}),
    ...(input.note !== undefined ? { note: input.note.trim() || null } : {})
  } as Prisma.FulfillmentNodeUncheckedCreateInput;
}

function normalizeCode(value?: string): string | null {
  const code = value?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  return code ? code.slice(0, 40) : null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
