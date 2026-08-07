import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ActorType,
  ConditionGrade,
  InventoryItemStatus,
  InventoryMovementType,
  Prisma,
  ProductGender,
  ProductStatus,
  SourceApp,
  WarehouseLocationStatus,
  prisma
} from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import { buildInventoryOverview } from "./inventory-overview";
import {
  MOVABLE_INVENTORY_STATUSES,
  WAREHOUSE_OCCUPYING_STATUSES,
  assertValidCapacity,
  locationMetrics,
  refreshWarehouseLocationStatuses
} from "./warehouse-capacity";

type LocationListInput = {
  adminUserId?: string;
  search?: string;
  status?: WarehouseLocationStatus;
  minCapacity?: number;
  maxCapacity?: number;
  onlyAvailable?: boolean;
  onlyFull?: boolean;
};

type LocationActor = {
  adminUserId: string;
  employeeId: string | null;
  actorType: ActorType;
};

type LocationMetricsRow = ReturnType<typeof locationMetrics>;

@Injectable()
export class OperationsWarehouseService {
  constructor(private readonly access: OperationsAccessService) {}

  async listLocations(input: LocationListInput) {
    await this.access.requirePermission(input.adminUserId, "warehouse-locations.view");
    const value = input.search?.trim();
    const locations = await prisma.warehouseLocation.findMany({
      where: {
        ...(value ? {
          OR: [
            { locationCode: { contains: value, mode: "insensitive" as const } },
            { zoneCode: { contains: value, mode: "insensitive" as const } },
            { rackCode: { contains: value, mode: "insensitive" as const } },
            { inventoryItems: { some: { barcode: { contains: value, mode: "insensitive" as const } } } },
            { inventoryItems: { some: { product: { title: { contains: value, mode: "insensitive" as const } } } } }
          ]
        } : {}),
        ...(Number.isFinite(input.minCapacity) ? { capacity: { gte: input.minCapacity } } : {}),
        ...(Number.isFinite(input.maxCapacity) ? { capacity: { lte: input.maxCapacity } } : {})
      },
      include: {
        inventoryItems: {
          where: { status: { in: WAREHOUSE_OCCUPYING_STATUSES } },
          include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
          orderBy: { updatedAt: "desc" }
        }
      },
      orderBy: [{ active: "desc" }, { locationCode: "asc" }],
      take: 500
    });

    return locations
      .map((location) => {
        const metrics = locationMetrics({
          id: location.id,
          locationCode: location.locationCode,
          capacity: location.capacity,
          currentItemCount: location.inventoryItems.length,
          active: location.active,
          status: location.status
        });
        return {
          ...location,
          status: metrics.effectiveStatus,
          currentItemCount: metrics.currentItemCount,
          remainingCapacity: metrics.remainingCapacity,
          utilizationPercent: metrics.utilizationPercent
        };
      })
      .filter((location) => !input.status || location.status === input.status)
      .filter((location) => !input.onlyAvailable || location.remainingCapacity > 0 && location.status === WarehouseLocationStatus.ACTIVE)
      .filter((location) => !input.onlyFull || location.status === WarehouseLocationStatus.FULL);
  }

  async locationSummary(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, "warehouse-locations.view");
    const locations = await this.loadLocationMetrics();
    return summarizeLocations(locations);
  }

  async createLocation(input: {
    adminUserId?: string;
    locationCode?: string;
    capacity?: number;
    status?: WarehouseLocationStatus;
    note?: string;
  }) {
    const actor = await this.actorFor(input.adminUserId, "warehouse-locations.manage");
    const locationCode = normalizedLocationCode(input.locationCode);
    const capacity = Number(input.capacity ?? 100);
    assertCapacityOrThrow(capacity, 0);
    const status = input.status === WarehouseLocationStatus.INACTIVE
      ? WarehouseLocationStatus.INACTIVE
      : WarehouseLocationStatus.ACTIVE;
    const [zoneCode, rackCode, binCode] = locationCode.split("-");
    try {
      return await prisma.$transaction(async (transaction) => {
        const location = await transaction.warehouseLocation.create({
          data: {
            locationCode,
            zoneCode: zoneCode || null,
            rackCode: rackCode || null,
            binCode: binCode || null,
            capacity,
            status,
            active: status !== WarehouseLocationStatus.INACTIVE,
            note: input.note?.trim() || null,
            qrCode: null
          }
        });
        await transaction.auditLog.create({ data: auditData(actor, {
          action: "WAREHOUSE_LOCATION_CREATED",
          entityId: location.id,
          afterJson: { locationCode, capacity, status },
          reason: input.note
        }) });
        return location;
      });
    } catch (error) {
      if (isUniqueConflict(error)) throw new BadRequestException("Warehouse location code already exists.");
      throw error;
    }
  }

  async bulkCreateLocations(input: {
    adminUserId?: string;
    prefix?: string;
    start?: string | number;
    end?: string | number;
    capacity?: number;
    status?: WarehouseLocationStatus;
    note?: string;
  }) {
    const actor = await this.actorFor(input.adminUserId, "warehouse-locations.manage");
    const prefix = normalizedPrefix(input.prefix);
    const startText = String(input.start ?? "0001").trim();
    const endText = String(input.end ?? startText).trim();
    if (!/^\d+$/.test(startText) || !/^\d+$/.test(endText)) {
      throw new BadRequestException("Bulk location start and end must be numeric.");
    }
    const start = Number(startText);
    const end = Number(endText);
    const count = end - start + 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || count > 200) {
      throw new BadRequestException("Bulk location range must contain 1 to 200 codes.");
    }
    const capacity = Number(input.capacity ?? 100);
    assertCapacityOrThrow(capacity, 0);
    const status = input.status === WarehouseLocationStatus.INACTIVE
      ? WarehouseLocationStatus.INACTIVE
      : WarehouseLocationStatus.ACTIVE;
    const width = Math.max(4, startText.length, endText.length);
    const locationCodes = Array.from({ length: count }, (_, index) => `${prefix}${String(start + index).padStart(width, "0")}`);
    const existing = await prisma.warehouseLocation.findMany({
      where: { locationCode: { in: locationCodes } },
      select: { locationCode: true }
    });
    if (existing.length > 0) {
      throw new BadRequestException(`Warehouse location code already exists: ${existing[0].locationCode}.`);
    }
    const rows = locationCodes.map((locationCode) => ({
      locationCode,
      zoneCode: prefix.split("-")[0] || null,
      rackCode: prefix.split("-")[1] || null,
      binCode: locationCode.slice(prefix.length),
      capacity,
      status,
      active: status !== WarehouseLocationStatus.INACTIVE,
      note: input.note?.trim() || null,
      qrCode: null
    }));
    try {
      return await prisma.$transaction(async (transaction) => {
        await transaction.warehouseLocation.createMany({ data: rows });
        await transaction.auditLog.create({ data: auditData(actor, {
          action: "WAREHOUSE_LOCATIONS_BULK_CREATED",
          entityId: null,
          afterJson: { locationCodes, capacity, status },
          reason: input.note
        }) });
        return transaction.warehouseLocation.findMany({
          where: { locationCode: { in: locationCodes } },
          orderBy: { locationCode: "asc" }
        });
      });
    } catch (error) {
      if (isUniqueConflict(error)) throw new BadRequestException("One or more warehouse location codes already exist.");
      throw error;
    }
  }

  async updateCapacity(locationId: string, input: { adminUserId?: string; capacity?: number; note?: string }) {
    const actor = await this.actorFor(input.adminUserId, "warehouse-locations.edit-capacity");
    const capacity = Number(input.capacity);
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id" FROM "WarehouseLocation" WHERE "id" = ${locationId} FOR UPDATE
      `);
      const location = await transaction.warehouseLocation.findUnique({ where: { id: locationId } });
      if (!location) throw new NotFoundException("Warehouse location was not found.");
      const currentItemCount = await transaction.inventoryItem.count({
        where: { locationId, status: { in: WAREHOUSE_OCCUPYING_STATUSES } }
      });
      assertCapacityOrThrow(capacity, currentItemCount);
      const status = !location.active || location.status === WarehouseLocationStatus.INACTIVE
        ? WarehouseLocationStatus.INACTIVE
        : currentItemCount >= capacity
          ? WarehouseLocationStatus.FULL
          : WarehouseLocationStatus.ACTIVE;
      const updated = await transaction.warehouseLocation.update({
        where: { id: locationId },
        data: { capacity, status }
      });
      await transaction.auditLog.create({ data: auditData(actor, {
        action: "WAREHOUSE_LOCATION_CAPACITY_CHANGED",
        entityId: location.id,
        beforeJson: { capacity: location.capacity, status: location.status },
        afterJson: { capacity, status, currentItemCount },
        reason: input.note
      }) });
      return { ...updated, currentItemCount, remainingCapacity: capacity - currentItemCount };
    });
  }

  async setLocationStatus(
    locationId: string,
    input: { adminUserId?: string; status?: WarehouseLocationStatus; note?: string }
  ) {
    const actor = await this.actorFor(input.adminUserId, "warehouse-locations.manage");
    if (input.status !== WarehouseLocationStatus.ACTIVE && input.status !== WarehouseLocationStatus.INACTIVE) {
      throw new BadRequestException("Warehouse location status must be ACTIVE or INACTIVE.");
    }
    return prisma.$transaction(async (transaction) => {
      const location = await transaction.warehouseLocation.findUnique({ where: { id: locationId } });
      if (!location) throw new NotFoundException("Warehouse location was not found.");
      const updated = await transaction.warehouseLocation.update({
        where: { id: locationId },
        data: {
          active: input.status === WarehouseLocationStatus.ACTIVE,
          status: input.status
        }
      });
      if (input.status === WarehouseLocationStatus.ACTIVE) {
        await refreshWarehouseLocationStatuses(transaction, [locationId]);
      }
      await transaction.auditLog.create({ data: auditData(actor, {
        action: input.status === WarehouseLocationStatus.ACTIVE
          ? "WAREHOUSE_LOCATION_ACTIVATED"
          : "WAREHOUSE_LOCATION_DEACTIVATED",
        entityId: location.id,
        beforeJson: { active: location.active, status: location.status },
        afterJson: { active: updated.active, status: input.status },
        reason: input.note
      }) });
      return transaction.warehouseLocation.findUniqueOrThrow({ where: { id: locationId } });
    });
  }

  async moveInventoryItem(input: {
    adminUserId?: string;
    inventoryItemId?: string;
    locationId?: string;
    note?: string;
  }) {
    const actor = await this.actorFor(input.adminUserId, "warehouse-locations.move-product");
    const inventoryItemId = input.inventoryItemId?.trim();
    const locationId = input.locationId?.trim();
    if (!inventoryItemId || !locationId) {
      throw new BadRequestException("Inventory item and destination location are required.");
    }
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id" FROM "WarehouseLocation" ORDER BY "id" FOR UPDATE
      `);
      const [item, destination] = await Promise.all([
        transaction.inventoryItem.findUnique({ where: { id: inventoryItemId } }),
        transaction.warehouseLocation.findUnique({ where: { id: locationId } })
      ]);
      if (!item) throw new NotFoundException("Inventory item was not found.");
      if (!destination || !destination.active || destination.status === WarehouseLocationStatus.INACTIVE) {
        throw new BadRequestException("Destination location is missing or inactive.");
      }
      if (!MOVABLE_INVENTORY_STATUSES.includes(item.status)) {
        throw new BadRequestException("Paid, picked, packed, delivered, or lost inventory cannot be moved from shelf management.");
      }
      if (item.locationId === locationId) return item;
      const destinationCount = await transaction.inventoryItem.count({
        where: { locationId, status: { in: WAREHOUSE_OCCUPYING_STATUSES } }
      });
      if (destinationCount >= destination.capacity) {
        throw new BadRequestException("Destination location has no available capacity.");
      }
      const updated = await transaction.inventoryItem.update({
        where: { id: item.id },
        data: { locationId }
      });
      await transaction.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          productId: item.productId,
          movementType: InventoryMovementType.MOVE,
          fromLocationId: item.locationId,
          toLocationId: locationId,
          employeeId: actor.employeeId,
          reason: input.note?.trim() || "Moved in warehouse location management."
        }
      });
      await refreshWarehouseLocationStatuses(transaction, [item.locationId ?? "", locationId]);
      await transaction.auditLog.create({ data: auditData(actor, {
        action: "WAREHOUSE_PRODUCT_MOVED",
        entityId: locationId,
        beforeJson: { inventoryItemId: item.id, productId: item.productId, locationId: item.locationId },
        afterJson: { inventoryItemId: item.id, productId: item.productId, locationId },
        reason: input.note
      }) });
      return updated;
    });
  }

  async inventoryOverview(input: {
    adminUserId?: string;
    category?: string;
    gender?: string;
    size?: string;
    condition?: string;
    published?: "published" | "unpublished";
    inventoryStatus?: InventoryItemStatus;
  }) {
    await this.access.requirePermission(input.adminUserId, "inventory-overview.view");
    const productWhere: Prisma.ProductWhereInput = {
      ...(input.category ? { category: { equals: input.category, mode: "insensitive" } } : {}),
      ...(input.gender ? { gender: input.gender as ProductGender } : {}),
      ...(input.size ? { finalSizeLabel: { equals: input.size, mode: "insensitive" } } : {}),
      ...(input.condition ? { conditionGrade: input.condition as ConditionGrade } : {}),
      ...(input.published === "published" ? { status: ProductStatus.PUBLISHED } : {}),
      ...(input.published === "unpublished" ? { status: { not: ProductStatus.PUBLISHED } } : {})
    };
    const [records, locations] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: {
          ...(input.inventoryStatus ? { status: input.inventoryStatus } : {}),
          product: productWhere
        },
        select: {
          status: true,
          locationId: true,
          product: {
            select: {
              category: true,
              subcategory: true,
              gender: true,
              finalSizeLabel: true,
              conditionGrade: true,
              status: true
            }
          }
        }
      }),
      this.loadLocationMetrics()
    ]);
    const overview = buildInventoryOverview(records.map((record) => ({
      ...record,
      product: {
        ...record.product,
        gender: record.product.gender,
        conditionGrade: record.product.conditionGrade
      }
    })));
    const shelfSummary = summarizeLocations(locations);
    return {
      snapshotAt: new Date().toISOString(),
      ...overview,
      shelfSummary,
      shelfDistribution: {
        topOccupied: [...locations]
          .sort((left, right) => right.utilizationPercent - left.utilizationPercent)
          .slice(0, 10)
          .map(locationDistributionRow),
        empty: locations.filter((location) => location.currentItemCount === 0).slice(0, 20).map(locationDistributionRow),
        full: locations.filter((location) => location.effectiveStatus === WarehouseLocationStatus.FULL).slice(0, 20).map(locationDistributionRow)
      }
    };
  }

  private async loadLocationMetrics() {
    const [locations, counts] = await Promise.all([
      prisma.warehouseLocation.findMany({ orderBy: { locationCode: "asc" } }),
      prisma.inventoryItem.groupBy({
        by: ["locationId"],
        where: { locationId: { not: null }, status: { in: WAREHOUSE_OCCUPYING_STATUSES } },
        _count: { _all: true }
      })
    ]);
    const countByLocation = new Map(counts.map((row) => [row.locationId, row._count._all]));
    return locations.map((location) => locationMetrics({
      id: location.id,
      locationCode: location.locationCode,
      capacity: location.capacity,
      currentItemCount: countByLocation.get(location.id) ?? 0,
      active: location.active,
      status: location.status
    }));
  }

  private async actorFor(adminUserId: string | undefined, permission: string): Promise<LocationActor> {
    const session = await this.access.requirePermission(adminUserId, permission);
    return {
      adminUserId: session.adminUser!.id,
      employeeId: session.adminUser?.linkedEmployee?.id ?? null,
      actorType: session.adminUser?.linkedEmployee?.id ? ActorType.EMPLOYEE : ActorType.SYSTEM
    };
  }
}

function auditData(actor: LocationActor, input: {
  action: string;
  entityId: string | null;
  beforeJson?: Prisma.InputJsonValue;
  afterJson?: Prisma.InputJsonValue;
  reason?: string;
}): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorType: actor.actorType,
    actorId: actor.employeeId,
    actorAdminUserId: actor.adminUserId,
    sourceApp: SourceApp.OPERATIONS,
    module: "WAREHOUSE",
    entityType: "WarehouseLocation",
    entityId: input.entityId,
    action: input.action,
    beforeJson: input.beforeJson,
    afterJson: input.afterJson,
    reason: input.reason?.trim() || null
  };
}

function summarizeLocations(locations: readonly LocationMetricsRow[]) {
  const totalCapacity = locations.reduce((sum, location) => sum + location.capacity, 0);
  const currentItemCount = locations.reduce((sum, location) => sum + location.currentItemCount, 0);
  return {
    totalLocations: locations.length,
    activeLocations: locations.filter((location) => location.effectiveStatus === WarehouseLocationStatus.ACTIVE).length,
    fullLocations: locations.filter((location) => location.effectiveStatus === WarehouseLocationStatus.FULL).length,
    inactiveLocations: locations.filter((location) => location.effectiveStatus === WarehouseLocationStatus.INACTIVE).length,
    totalCapacity,
    currentItemCount,
    remainingCapacity: Math.max(0, totalCapacity - currentItemCount),
    utilizationPercent: totalCapacity > 0 ? Math.round((currentItemCount / totalCapacity) * 1000) / 10 : 0
  };
}

function locationDistributionRow(location: LocationMetricsRow) {
  return {
    id: location.id,
    locationCode: location.locationCode,
    status: location.effectiveStatus,
    currentItemCount: location.currentItemCount,
    capacity: location.capacity,
    remainingCapacity: location.remainingCapacity,
    utilizationPercent: location.utilizationPercent
  };
}

function normalizedLocationCode(value?: string) {
  const code = value?.trim().toUpperCase();
  if (!code || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) {
    throw new BadRequestException("Warehouse location code is required and may contain letters, numbers, and hyphens.");
  }
  return code;
}

function normalizedPrefix(value?: string) {
  const prefix = value?.trim().toUpperCase();
  if (!prefix || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(prefix)) {
    throw new BadRequestException("Warehouse location prefix is required and may contain letters, numbers, and hyphens.");
  }
  return prefix;
}

function assertCapacityOrThrow(capacity: number, currentItemCount: number) {
  try {
    assertValidCapacity(capacity, currentItemCount);
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : "Capacity is not valid.");
  }
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
