import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ActorType,
  InventoryItemStatus,
  InventoryMovementType,
  ProductStatus,
  SourceApp,
  prisma
} from "@online-saler/database";
import { ProductApplicationService } from "../product/product-application.service";
import { OperationsAccessService } from "./operations-access.service";
import { STAGING_TEST_EMPLOYEE_ID } from "./operations-workspace.service";

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

function defaultLocationCodes(): string[] {
  const codes: string[] = [];
  for (let row = 1; row <= 10; row += 1) {
    for (let column = 1; column <= 10; column += 1) {
      codes.push(`A-01${String(row).padStart(2, "0")}${String(column).padStart(2, "0")}`);
    }
  }
  return codes;
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

    if (product.status === ProductStatus.BARCODE_ASSIGNED) {
      product = await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.REVIEW_PENDING,
        actor
      });
    }
    if (product.status === ProductStatus.REVIEW_PENDING) {
      product = await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.APPROVED,
        actor
      });
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

  async assignRandomLocation(productId: string, input: { employeeId?: string; adminUserId?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const product = await this.requireProduct(productId);
    if (!product.barcode) {
      throw new BadRequestException("Generate barcode before assigning a warehouse location.");
    }
    if (product.status !== ProductStatus.READY_FOR_STORAGE && product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException("Set the price and mark the item ready for storage first.");
    }

    await this.ensureDefaultLocations();
    const locations = await prisma.warehouseLocation.findMany({
      where: { active: true },
      orderBy: { locationCode: "asc" }
    });
    if (locations.length === 0) {
      throw new BadRequestException("No active warehouse locations are available.");
    }

    const existing = await prisma.inventoryItem.findUnique({
      where: { productId },
      include: { location: true }
    });
    if (existing?.locationId) {
      return this.productDetail(productId);
    }

    const randomLocation = locations[Math.floor(Math.random() * locations.length)];
    await prisma.$transaction(async (transaction) => {
      const item = existing
        ? await transaction.inventoryItem.update({
            where: { id: existing.id },
            data: {
              locationId: randomLocation.id,
              createdByEmployeeId: existing.createdByEmployeeId ?? employeeId
            }
          })
        : await transaction.inventoryItem.create({
            data: {
              productId,
              barcode: product.barcode!,
              locationId: randomLocation.id,
              createdByEmployeeId: employeeId
            }
          });

      await transaction.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          productId,
          movementType: InventoryMovementType.LOCATION_ASSIGNED,
          toLocationId: randomLocation.id,
          employeeId,
          reason: "Random stock-in location assigned"
        }
      });
    });

    return this.productDetail(productId);
  }

  async confirmPlaced(productId: string, input: { employeeId?: string; adminUserId?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const product = await this.requireProduct(productId);
    if (!product.barcode) {
      throw new BadRequestException("Generate barcode before stock-in.");
    }

    const detail = await this.assignRandomLocation(productId, { employeeId, adminUserId: input.adminUserId });
    const item = detail.inventoryItem;
    if (!item?.id || !item.locationId) {
      throw new BadRequestException("Assign a location before confirming placement.");
    }
    if (item.status === InventoryItemStatus.AVAILABLE) {
      return this.productDetail(productId);
    }

    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.inventoryItem.update({
        where: { id: item.id },
        data: {
          status: InventoryItemStatus.AVAILABLE,
          checkedInAt: new Date()
        }
      });

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
    this.assertPublishable(detail);

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
    await this.ensureDefaultLocations();
    const locations = await prisma.warehouseLocation.findMany({
      where: { active: true },
      include: {
        _count: {
          select: { inventoryItems: true }
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

  private assertPublishable(product: Awaited<ReturnType<OperationsProductControlService["productDetail"]>>) {
    if (!product.barcode) {
      throw new BadRequestException("Generate barcode before publishing.");
    }
    if (!product.title?.trim()) {
      throw new BadRequestException("Confirm the title before publishing.");
    }
    if (!product.category?.trim()) {
      throw new BadRequestException("Confirm the category before publishing.");
    }
    if (!product.finalSizeLabel?.trim()) {
      throw new BadRequestException("Confirm the size label before publishing.");
    }
    if (!product.conditionGrade) {
      throw new BadRequestException("Confirm the condition before publishing.");
    }
    if (!product.measurements.some((measurement) => measurement.measurementType === "LENGTH" && measurement.finalValueCm) ||
        !product.measurements.some((measurement) => measurement.measurementType === "CHEST_WIDTH" && measurement.finalValueCm)) {
      throw new BadRequestException("Confirm length and chest measurements before publishing.");
    }
    if (!product.priceKsh || product.priceKsh <= 0) {
      throw new BadRequestException("Set the price before publishing.");
    }
    if (!product.images.length) {
      throw new BadRequestException("Add at least one product photo before publishing.");
    }
    if (product.inventoryItem?.status !== InventoryItemStatus.AVAILABLE) {
      throw new BadRequestException("Confirm the item is placed in the warehouse before publishing.");
    }
  }

  private async ensureDefaultLocations() {
    const count = await prisma.warehouseLocation.count();
    if (count > 0) return;
    await prisma.warehouseLocation.createMany({
      data: defaultLocationCodes().map((locationCode) => ({ locationCode })),
      skipDuplicates: true
    });
  }

  private productInclude() {
    return {
      images: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      measurements: {
        orderBy: { measurementType: "asc" }
      },
      defects: {
        orderBy: { createdAt: "asc" }
      },
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
