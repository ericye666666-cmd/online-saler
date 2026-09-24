import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ActorType,
  InventoryItemStatus,
  InventoryMovementType,
  Prisma,
  ProductStatus,
  SourceApp,
  prisma
} from "@online-saler/database";
import { ProductApplicationService } from "../product/product-application.service";
import { OperationsAccessService } from "./operations-access.service";
import { canReserveStorageLocation } from "./product-storage-reservation";
import { productPublicationBlocker } from "../product/product-publication-readiness";
import { loadConfirmedDisplayImage } from "../product/product-publication-evidence";
import { STAGING_TEST_EMPLOYEE_ID } from "./operations-workspace.service";
import {
  MOVABLE_INVENTORY_STATUSES,
  WAREHOUSE_OCCUPYING_STATUSES,
  buildShelfAllocationPlan,
  refreshWarehouseLocationStatuses,
  type ShelfCapacitySnapshot
} from "./warehouse-capacity";

const PRODUCT_CONTROL_PAGE = "page.product.control";
const PRODUCT_EDIT_ACTION = "action.product.edit";
const PRODUCT_APPROVE_ACTION = "action.product.approve";
const PRODUCT_PUBLISH_ACTION = "action.product.publish";

const CONTROL_STATUSES = [
  ProductStatus.BARCODE_ASSIGNED,
  ProductStatus.REVIEW_PENDING,
  ProductStatus.APPROVED,
  ProductStatus.READY_FOR_STORAGE,
  ProductStatus.PUBLISHED,
  ProductStatus.UNPUBLISHED
] as const;

function employeeIdOrDefault(employeeId?: string): string {
  return employeeId?.trim() || STAGING_TEST_EMPLOYEE_ID;
}

@Injectable()
export class OperationsProductControlService {
  constructor(
    private readonly products: ProductApplicationService,
    private readonly access: OperationsAccessService
  ) {}

  async summary(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, PRODUCT_CONTROL_PAGE);
    const [readyForPrice, readyForStorage, readyToPublish, pendingStockIn, available, published, printedToday] = await Promise.all([
      prisma.product.count({ where: { status: ProductStatus.BARCODE_ASSIGNED, priceKsh: null } }),
      prisma.product.count({ where: { status: ProductStatus.READY_FOR_STORAGE } }),
      prisma.product.count({
        where: {
          status: ProductStatus.READY_FOR_STORAGE,
          barcode: { not: null },
          priceKsh: { gt: 0 },
          images: { some: {} },
          inventoryItem: {
            is: {
              status: InventoryItemStatus.AVAILABLE
            }
          }
        }
      }),
      prisma.inventoryItem.count({ where: { status: InventoryItemStatus.PENDING_STOCK_IN } }),
      prisma.inventoryItem.count({ where: { status: InventoryItemStatus.AVAILABLE } }),
      prisma.product.count({ where: { status: ProductStatus.PUBLISHED } }),
      prisma.product.count({
        where: {
          labelPrintedAt: { gte: startOfToday() }
        }
      })
    ]);

    return {
      readyForPrice,
      readyForStorage,
      readyToPublish,
      pendingStockIn,
      available,
      published,
      printedToday
    };
  }

  async list(status?: ProductStatus, adminUserId?: string) {
    await this.access.requirePermission(adminUserId, PRODUCT_CONTROL_PAGE);
    if (status && !Object.values(ProductStatus).includes(status)) {
      throw new BadRequestException("Product status filter is not valid.");
    }
    const where = status ? { status } : { status: { in: [...CONTROL_STATUSES] } };
    return prisma.product.findMany({
      where,
      include: this.productInclude(),
      orderBy: { updatedAt: "desc" },
      take: 80
    });
  }

  async setPrice(productId: string, input: { employeeId?: string; adminUserId?: string; priceKsh?: number }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const priceKsh = Number(input.priceKsh);
    if (!Number.isInteger(priceKsh) || priceKsh <= 0) {
      throw new BadRequestException("Enter a valid price in KSh.");
    }

    const before = await this.requireProduct(productId);
    const product = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.product.update({
        where: { id: productId },
        data: { priceKsh },
        include: this.productInclude()
      });

      await transaction.auditLog.create({
        data: {
          actorType: ActorType.EMPLOYEE,
          actorId: employeeId,
          sourceApp: SourceApp.OPERATIONS,
          module: "PRODUCT",
          entityType: "Product",
          entityId: productId,
          action: "PRODUCT_PRICE_SET",
          beforeJson: { priceKsh: before.priceKsh },
          afterJson: { priceKsh }
        }
      });

      return updated;
    });

    return product;
  }

  async prepareForStorage(productId: string, input: { employeeId?: string; adminUserId?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION);
    let product = await this.requireProduct(productId);
    if (!product.barcode) {
      throw new BadRequestException("Generate barcode before preparing storage.");
    }
    if (!product.priceKsh || product.priceKsh <= 0) {
      throw new BadRequestException("Set the price before preparing storage.");
    }

    const actor = {
      actorType: ActorType.EMPLOYEE,
      actorId: employeeId,
      sourceApp: SourceApp.OPERATIONS
    };

    if (product.status !== ProductStatus.APPROVED && product.status !== ProductStatus.READY_FOR_STORAGE) {
      throw new BadRequestException("Approve the product before preparing storage.");
    }
    if (product.status === ProductStatus.APPROVED) {
      product = await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.READY_FOR_STORAGE,
        actor
      });
    }

    return this.productDetail(productId);
  }

  async markLabelsPrinted(input: { employeeId?: string; adminUserId?: string; productIds?: string[] }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const productIds = Array.isArray(input.productIds)
      ? input.productIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())
      : [];
    if (productIds.length === 0) {
      throw new BadRequestException("Choose at least one product to mark printed.");
    }

    const now = new Date();
    await prisma.$transaction(async (transaction) => {
      await transaction.product.updateMany({
        where: { id: { in: productIds }, barcode: { not: null } },
        data: { labelPrintedAt: now }
      });
      await transaction.auditLog.createMany({
        data: productIds.map((productId) => ({
          actorType: ActorType.EMPLOYEE,
          actorId: employeeId,
          sourceApp: SourceApp.OPERATIONS,
          module: "PRODUCT",
          entityType: "Product",
          entityId: productId,
          action: "PRODUCT_LABEL_PRINTED",
          afterJson: { labelPrintedAt: now.toISOString() }
        }))
      });
    });

    return { printedAt: now.toISOString(), productIds };
  }

  async assignProductLocation(productId: string, input: { employeeId?: string; adminUserId?: string; locationId?: string }) {
    await this.assignBatchLocations([productId], input);
    return this.productDetail(productId);
  }

  // Puts every product that has no shelf yet onto one shelf. The shelf is the
  // one the employee chose, or, when none is given, the shelf the rest of the
  // product's batch already sits on. There is no automatic choice.
  async assignBatchLocations(
    productIds: readonly string[],
    input: { employeeId?: string; adminUserId?: string; locationId?: string }
  ) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    const session = await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const uniqueProductIds = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueProductIds.length === 0) return [];

    await prisma.$transaction(async (transaction) => {
      await lockShelves(transaction);

      const [products, existingItems] = await Promise.all([
        transaction.product.findMany({
          where: { id: { in: uniqueProductIds } },
          select: { id: true, barcode: true, status: true, batchId: true }
        }),
        transaction.inventoryItem.findMany({
          where: { productId: { in: uniqueProductIds } }
        })
      ]);

      if (products.length !== uniqueProductIds.length) {
        throw new BadRequestException("One or more products were not found.");
      }
      const invalidProduct = products.find((product) =>
        !product.barcode || !canReserveStorageLocation(product.status, product.barcode)
      );
      if (invalidProduct) {
        throw new BadRequestException("Generate the formal barcode before reserving a warehouse location.");
      }

      const existingByProduct = new Map(existingItems.map((item) => [item.productId, item]));
      const unassignedProductIds = uniqueProductIds.filter((productId) => !existingByProduct.get(productId)?.locationId);
      if (unassignedProductIds.length === 0) return;

      const locationId = input.locationId?.trim() || await batchShelfId(transaction, products);
      if (!locationId) {
        throw new BadRequestException("Choose a shelf for this batch first.");
      }
      const shelf = await loadShelf(transaction, locationId);
      let assignments;
      try {
        assignments = buildShelfAllocationPlan(unassignedProductIds, shelf);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : "No shelf location has enough available capacity.");
      }

      const productById = new Map(products.map((product) => [product.id, product]));
      for (const assignment of assignments) {
        const product = productById.get(assignment.productId)!;
        const existing = existingByProduct.get(assignment.productId);
        const item = existing
          ? await transaction.inventoryItem.update({
              where: { id: existing.id },
              data: {
                barcode: product.barcode!,
                locationId: assignment.locationId,
                createdByEmployeeId: existing.createdByEmployeeId ?? employeeId
              }
            })
          : await transaction.inventoryItem.create({
              data: {
                productId: product.id,
                barcode: product.barcode!,
                locationId: assignment.locationId,
                createdByEmployeeId: employeeId
              }
            });
        await transaction.inventoryMovement.create({
          data: {
            inventoryItemId: item.id,
            productId: product.id,
            movementType: InventoryMovementType.LOCATION_ASSIGNED,
            toLocationId: assignment.locationId,
            employeeId,
            reason: "Employee chose the shelf for the batch"
          }
        });
      }

      await refreshWarehouseLocationStatuses(transaction, [shelf.id]);
      await transaction.auditLog.create({
        data: {
          actorType: ActorType.EMPLOYEE,
          actorId: employeeId,
          actorAdminUserId: session.adminUser?.id ?? null,
          sourceApp: SourceApp.OPERATIONS,
          module: "WAREHOUSE",
          entityType: "ProductBatch",
          entityId: products[0]?.batchId ?? null,
          action: "WAREHOUSE_BATCH_SHELF_ASSIGNED",
          afterJson: {
            locationCode: shelf.locationCode,
            productIds: assignments.map((assignment) => assignment.productId)
          },
          reason: "The whole batch was put on the shelf the employee chose."
        }
      });
    }, { timeout: 20_000 });

    return Promise.all(uniqueProductIds.map((productId) => this.productDetail(productId)));
  }

  // Moves a batch's garments that are still in the warehouse onto another
  // shelf. Paid items wait for picking where they are, so they stay put.
  async moveProductsToShelf(
    productIds: readonly string[],
    input: { employeeId?: string; adminUserId?: string; locationId?: string; batchId?: string }
  ) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    const session = await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const locationId = input.locationId?.trim();
    if (!locationId) throw new BadRequestException("Choose the shelf to move the batch to.");
    const uniqueProductIds = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];

    return prisma.$transaction(async (transaction) => {
      await lockShelves(transaction);
      const shelf = await loadShelf(transaction, locationId);
      const items = await transaction.inventoryItem.findMany({
        where: {
          productId: { in: uniqueProductIds },
          locationId: { not: null },
          status: { in: MOVABLE_INVENTORY_STATUSES }
        }
      });
      const moving = items.filter((item) => item.locationId !== shelf.id);
      if (moving.length === 0) return { locationCode: shelf.locationCode, moved: 0 };
      try {
        buildShelfAllocationPlan(moving.map((item) => item.productId), shelf);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : "No shelf location has enough available capacity.");
      }

      for (const item of moving) {
        await transaction.inventoryItem.update({ where: { id: item.id }, data: { locationId: shelf.id } });
        await transaction.inventoryMovement.create({
          data: {
            inventoryItemId: item.id,
            productId: item.productId,
            movementType: InventoryMovementType.MOVE,
            fromLocationId: item.locationId,
            toLocationId: shelf.id,
            employeeId,
            reason: "Employee moved the whole batch to another shelf"
          }
        });
      }
      await refreshWarehouseLocationStatuses(transaction, [shelf.id, ...moving.map((item) => item.locationId!)]);
      await transaction.auditLog.create({
        data: {
          actorType: ActorType.EMPLOYEE,
          actorId: employeeId,
          actorAdminUserId: session.adminUser?.id ?? null,
          sourceApp: SourceApp.OPERATIONS,
          module: "WAREHOUSE",
          entityType: "ProductBatch",
          entityId: input.batchId ?? null,
          action: "WAREHOUSE_BATCH_SHELF_MOVED",
          afterJson: { locationCode: shelf.locationCode, productIds: moving.map((item) => item.productId) },
          reason: "The batch was moved to another shelf."
        }
      });
      return { locationCode: shelf.locationCode, moved: moving.length };
    }, { timeout: 20_000 });
  }

  async confirmPlaced(productId: string, input: { employeeId?: string; adminUserId?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const product = await this.requireProduct(productId);
    if (!product.barcode) {
      throw new BadRequestException("Generate barcode before stock-in.");
    }
    if (product.status !== ProductStatus.READY_FOR_STORAGE) {
      throw new BadRequestException("Only storage-ready items can be confirmed placed.");
    }

    const detail = await this.assignProductLocation(productId, { employeeId, adminUserId: input.adminUserId });
    const item = detail.inventoryItem;
    if (!item?.id || !item.locationId) {
      throw new BadRequestException("Assign a location before confirming placement.");
    }
    if (item.status === InventoryItemStatus.AVAILABLE) {
      return this.productDetail(productId);
    }
    if (item.status !== InventoryItemStatus.PENDING_STOCK_IN) {
      throw new BadRequestException("Only pending stock-in items can be confirmed placed.");
    }

    await prisma.$transaction(async (transaction) => {
      const changed = await transaction.inventoryItem.updateMany({
        where: {
          id: item.id,
          status: InventoryItemStatus.PENDING_STOCK_IN,
          locationId: item.locationId,
          barcode: product.barcode!,
          product: { status: ProductStatus.READY_FOR_STORAGE }
        },
        data: {
          status: InventoryItemStatus.AVAILABLE,
          checkedInAt: new Date()
        }
      });
      if (changed.count === 0) {
        throw new BadRequestException("Inventory changed while confirming placement. Refresh the item before retrying.");
      }
      const updated = await transaction.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });

      await transaction.inventoryMovement.create({
        data: {
          inventoryItemId: updated.id,
          productId,
          movementType: InventoryMovementType.STOCK_IN,
          toLocationId: updated.locationId,
          employeeId,
          reason: "Employee confirmed item placed"
        }
      });
    });

    return this.productDetail(productId);
  }

  async publish(productId: string, input: { employeeId?: string; adminUserId?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_PUBLISH_ACTION);
    const detail = await this.productDetail(productId);
    if (detail.status === ProductStatus.PUBLISHED) {
      return detail;
    }
    if (detail.status !== ProductStatus.READY_FOR_STORAGE && detail.status !== ProductStatus.UNPUBLISHED) {
      throw new BadRequestException("Only storage-ready items can be published.");
    }
    await this.assertPublishable(detail);

    await this.products.transitionProduct({
      productId,
      toStatus: ProductStatus.PUBLISHED,
      inventoryAvailable: true,
      actor: {
        actorType: ActorType.EMPLOYEE,
        actorId: employeeId,
        sourceApp: SourceApp.OPERATIONS
      }
    });

    return this.productDetail(productId);
  }

  async unpublish(productId: string, input: { employeeId?: string; adminUserId?: string; reason?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_PUBLISH_ACTION);
    const reason = input.reason?.trim() || "Operations product control";
    const product = await this.requireProduct(productId);
    if (product.status !== ProductStatus.PUBLISHED) {
      return this.productDetail(productId);
    }

    await this.products.transitionProduct({
      productId,
      toStatus: ProductStatus.UNPUBLISHED,
      reason,
      actor: {
        actorType: ActorType.EMPLOYEE,
        actorId: employeeId,
        sourceApp: SourceApp.OPERATIONS
      }
    });

    return this.productDetail(productId);
  }

  async locations(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, PRODUCT_CONTROL_PAGE);
    const locations = await prisma.warehouseLocation.findMany({
      where: { active: true },
      include: {
        _count: {
          select: {
            inventoryItems: { where: { status: { in: WAREHOUSE_OCCUPYING_STATUSES } } }
          }
        }
      },
      orderBy: { locationCode: "asc" },
      take: 120
    });
    return locations;
  }

  private async requireProduct(productId: string) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found.");
    return product;
  }

  private async productDetail(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: this.productInclude()
    });
    if (!product) throw new NotFoundException("Product not found.");
    return product;
  }

  async assertPublishable(product: Awaited<ReturnType<OperationsProductControlService["productDetail"]>>) {
    const mainImage = await loadConfirmedDisplayImage(prisma, product.id);
    const blocker = productPublicationBlocker(product, mainImage);
    if (blocker) throw new BadRequestException(blocker);
  }

  private productInclude() {
    return {
      images: {
        orderBy: { createdAt: "desc" }
      },
      measurements: {
        orderBy: { measurementType: "asc" }
      },
      defects: {
        orderBy: { createdAt: "asc" }
      },
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      inventoryItem: {
        include: { location: true }
      }
    } as const;
  }
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

async function lockShelves(transaction: Prisma.TransactionClient) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "WarehouseLocation"
    WHERE "active" = true AND "status" <> 'INACTIVE'::"WarehouseLocationStatus"
    ORDER BY "id"
    FOR UPDATE
  `);
}

// The shelf most of the products' batch already sits on, so a garment added to
// a batch late, or re-prepared, follows the rest of its batch.
async function batchShelfId(
  transaction: Prisma.TransactionClient,
  products: ReadonlyArray<{ batchId: string | null }>
): Promise<string | null> {
  const batchIds = [...new Set(products.map((product) => product.batchId).filter((id): id is string => Boolean(id)))];
  if (batchIds.length === 0) return null;
  const rows = await transaction.inventoryItem.groupBy({
    by: ["locationId"],
    where: {
      locationId: { not: null },
      status: { in: WAREHOUSE_OCCUPYING_STATUSES },
      product: { batchId: { in: batchIds } }
    },
    _count: { _all: true }
  });
  const [top] = rows.sort((left, right) => right._count._all - left._count._all);
  return top?.locationId ?? null;
}

async function loadShelf(transaction: Prisma.TransactionClient, locationId: string): Promise<ShelfCapacitySnapshot> {
  const [shelf, currentItemCount] = await Promise.all([
    transaction.warehouseLocation.findUnique({ where: { id: locationId } }),
    transaction.inventoryItem.count({
      where: { locationId, status: { in: WAREHOUSE_OCCUPYING_STATUSES } }
    })
  ]);
  if (!shelf) throw new BadRequestException("Shelf not found.");
  return {
    id: shelf.id,
    locationCode: shelf.locationCode,
    capacity: shelf.capacity,
    currentItemCount,
    active: shelf.active,
    status: shelf.status
  };
}
