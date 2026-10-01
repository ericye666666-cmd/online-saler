import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ActorType,
  InventoryMovementType,
  Prisma,
  ProductBatchStatus,
  ProductStatus,
  ReviewResult,
  SourceApp,
  WarehouseLocationStatus,
  prisma
} from "@online-saler/database";
import { PRODUCT_AI_PROMPT_VERSION } from "@online-saler/shared-types";
import { AIJobService } from "../ai/ai-job.service";
import { ProductApplicationService } from "../product/product-application.service";
import { ProductBarcodeService } from "../product/product-barcode.service";
import { ProductDetailGenerationService } from "../product/product-detail-generation.service";
import { ProductImageProcessingService } from "../product/product-image-processing.service";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsProductControlService } from "./operations-product-control.service";
import { STAGING_TEST_EMPLOYEE_ID } from "./operations-workspace.service";
import { deriveProductFactoryBatchFlow, startOfDayAtUtcOffset } from "./product-factory-batch-flow";
import {
  DEFAULT_PRODUCT_BATCH_SIZE,
  isAllowedProductBatchSize
} from "./product-factory-batch-size";
import { managedProductStatus, productFactoryVisibilityWhere } from "./product-factory-list-filter";
import { buildProductBatchImagePreviews } from "./product-batch-image-preview";
import { canGenerateOrReuseBarcode } from "./product-storage-reservation";
import { loadConfirmedDisplayImage } from "../product/product-publication-evidence";
import { productApprovalBlocker, productContentBlocker } from "../product/product-publication-readiness";
import { refreshWarehouseLocationStatuses, WAREHOUSE_OCCUPYING_STATUSES } from "./warehouse-capacity";
import { BatchCancellationError, planBatchCancellation } from "./product-batch-cancellation";
import { ProductStateMachine } from "../product/product-state-machine";
import { ProductRestorationError, planProductRestoration } from "./product-restoration";
import { hardDeleteProducts } from "./product-hard-delete";
import { listPage, listPageRequest, listPageWindow } from "./list-page";
import {
  activeBatchProducts,
  batchItemsAccountedFor,
  DISPLAY_REVIEW_REJECTABLE_STATUSES
} from "./product-batch-active-items";

const PRODUCT_DIGITALIZE_PAGE = "page.product.digitalization";
const PRODUCT_CONTROL_PAGE = "page.product.control";
const PRODUCT_CREATE_ACTION = "action.product.create";
const PRODUCT_EDIT_ACTION = "action.product.edit";
const PRODUCT_APPROVE_ACTION = "action.product.approve";

type ProductQueue =
  | "all"
  | "exceptions"
  | "waiting-upload"
  | "waiting-ai"
  | "calibration"
  | "review"
  | "published"
  | "rejected"
  | "barcode"
  // 商品管理: only PUBLISHED (default) or UNPUBLISHED, picked by `status`.
  | "managed";

type ListInput = {
  adminUserId?: string;
  queue?: ProductQueue;
  status?: ProductStatus;
  search?: string;
  batchId?: string;
  category?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  includeTestData?: boolean;
  /** Asking for a page turns the reply into `{ items, total, page, pageSize, pageCount }`. */
  page?: string | number;
  pageSize?: string | number;
};

type ReviewInput = {
  adminUserId?: string;
  employeeId?: string;
  result?: ReviewResult;
  reason?: string;
};

function employeeIdOrDefault(employeeId?: string): string {
  return employeeId?.trim() || STAGING_TEST_EMPLOYEE_ID;
}

function batchCode(): string {
  return `BATCH-${Date.now()}`;
}

@Injectable()
export class OperationsProductBatchService {
  constructor(
    private readonly access: OperationsAccessService,
    private readonly aiJobs: AIJobService,
    private readonly barcodes: ProductBarcodeService,
    private readonly products: ProductApplicationService,
    private readonly productControl: OperationsProductControlService,
    private readonly details: ProductDetailGenerationService,
    private readonly imageProcessing: ProductImageProcessingService
  ) {}

  async summary(adminUserId?: string, employeeId?: string) {
    await this.access.requirePermission(adminUserId, PRODUCT_DIGITALIZE_PAGE);
    const operatorId = employeeIdOrDefault(employeeId);
    const whereOperator = { createdByEmployeeId: operatorId, ...productFactoryVisibilityWhere() };
    const todayStart = startOfDayAtUtcOffset(new Date(), 180);
    const [
      activeBatches,
      activeBatchCount,
      todayNewBatches,
      todayCompletedProducts,
      waitingUpload,
      waitingAi,
      waitingCalibration,
      waitingLabelApply,
      waitingReview,
      waitingStorage,
      published,
      rejected,
      barcodeReady,
      exceptions
    ] =
      await Promise.all([
        prisma.productBatch.findMany({
          where: { status: ProductBatchStatus.OPEN, createdByEmployeeId: operatorId },
          include: {
            products: {
              include: this.productInclude(),
              orderBy: { batchItemNumber: "asc" }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 12
        }),
        prisma.productBatch.count({
          where: { status: ProductBatchStatus.OPEN, createdByEmployeeId: operatorId }
        }),
        prisma.productBatch.count({
          where: { createdByEmployeeId: operatorId, createdAt: { gte: todayStart } }
        }),
        prisma.product.count({
          where: { ...whereOperator, status: ProductStatus.PUBLISHED, publishedAt: { gte: todayStart } }
        }),
        prisma.product.count({ where: { ...whereOperator, status: ProductStatus.DRAFT } }),
        prisma.product.count({ where: { ...whereOperator, status: { in: [ProductStatus.PHOTOGRAPHED, ProductStatus.AI_PROCESSING] } } }),
        prisma.product.count({ where: { ...whereOperator, status: { in: [ProductStatus.AI_PROCESSED, ProductStatus.CALIBRATION_PENDING] } } }),
        prisma.product.count({ where: { ...whereOperator, status: ProductStatus.BARCODE_ASSIGNED, labelPrintedAt: null } }),
        prisma.product.count({
          where: {
            ...whereOperator,
            OR: [
              { status: ProductStatus.BARCODE_ASSIGNED, labelPrintedAt: { not: null } },
              { status: ProductStatus.REVIEW_PENDING }
            ]
          }
        }),
        prisma.product.count({ where: { ...whereOperator, status: { in: [ProductStatus.APPROVED, ProductStatus.READY_FOR_STORAGE] } } }),
        prisma.product.count({ where: { ...whereOperator, status: ProductStatus.PUBLISHED } }),
        prisma.product.count({ where: { ...whereOperator, status: ProductStatus.ARCHIVED } }),
        prisma.product.count({ where: { ...whereOperator, status: ProductStatus.CALIBRATED } }),
        prisma.product.count({ where: { ...whereOperator, status: ProductStatus.REWORK_REQUIRED } })
      ]);

    const serializedBatches = activeBatches.map((batch) => this.serializeBatch(batch));

    return {
      employeeId: operatorId,
      metrics: {
        todayNewBatches,
        todayCompletedProducts,
        activeBatchCount,
        exceptionCount: exceptions
      },
      continueBatch: serializedBatches[0] ?? null,
      activeBatches: serializedBatches,
      tasks: {
        upload: waitingUpload,
        aiImage: waitingAi,
        calibration: waitingCalibration,
        labelApply: waitingLabelApply,
        review: waitingReview,
        storage: waitingStorage
      },
      queues: {
        waitingUpload,
        waitingAi,
        waitingCalibration,
        waitingReview,
        waitingStorage,
        published,
        rejected,
        barcodeReady,
        exceptions
      }
    };
  }

  async listBatches(input: { adminUserId?: string; employeeId?: string; status?: ProductBatchStatus }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_DIGITALIZE_PAGE);
    const operatorId = employeeIdOrDefault(input.employeeId);
    const batches = await prisma.productBatch.findMany({
      where: {
        createdByEmployeeId: operatorId,
        ...(input.status ? { status: input.status } : {})
      },
      include: {
        products: {
          include: this.productInclude(),
          orderBy: { batchItemNumber: "asc" }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return batches.map((batch) => this.serializeBatch(batch));
  }

  async createBatch(input: { adminUserId?: string; employeeId?: string; targetCount?: number; note?: string; intakeCategory?: "SHOES" | null }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_CREATE_ACTION);
    if (input.intakeCategory != null && input.intakeCategory !== "SHOES") {
      throw new BadRequestException("Choose the clothing workflow or SHOES intake category.");
    }
    const intakeCategory = input.intakeCategory ?? null;
    const targetCount = input.targetCount ?? DEFAULT_PRODUCT_BATCH_SIZE;
    if (!isAllowedProductBatchSize(targetCount)) {
      throw new BadRequestException("Batch quantity must be a positive whole number.");
    }

    const code = batchCode();
    const batch = await prisma.$transaction(async (transaction) => {
      const created = await transaction.productBatch.create({
        data: {
          batchCode: code,
          targetCount,
          intakeCategory,
          createdByEmployeeId: employeeId,
          note: input.note?.trim() || null
        }
      });

      await transaction.product.createMany({
        data: Array.from({ length: targetCount }, (_, index) => ({
          productCode: `${code}-${String(index + 1).padStart(2, "0")}`,
          batchId: created.id,
          batchItemNumber: index + 1,
          category: intakeCategory,
          createdByEmployeeId: employeeId
        }))
      });

      return created;
    });

    return this.batchDetail(batch.id, input.adminUserId);
  }

  async batchDetail(batchId: string, adminUserId?: string) {
    await this.access.requirePermission(adminUserId, PRODUCT_DIGITALIZE_PAGE);
    await this.details.ensureBatchGenerationJobs(batchId);
    const batch = await prisma.productBatch.findUnique({
      where: { id: batchId },
      include: {
        products: {
          include: this.productInclude(),
          orderBy: { batchItemNumber: "asc" }
        }
      }
    });
    if (!batch) throw new NotFoundException("Product batch not found.");
    const productIds = batch.products.map((product) => product.id);
    const [variantAssets, selections] = productIds.length
      ? await Promise.all([
          prisma.productImageVariantAsset.findMany({
            where: { productId: { in: productIds } },
            orderBy: { createdAt: "desc" }
          }),
          prisma.productMainImageSelection.findMany({
            where: { productId: { in: productIds } }
          })
        ])
      : [[], []];
    const variantsByProduct = new Map<string, typeof variantAssets>();
    for (const asset of variantAssets) {
      const productAssets = variantsByProduct.get(asset.productId) ?? [];
      productAssets.push(asset);
      variantsByProduct.set(asset.productId, productAssets);
    }
    const selectionByProduct = new Map(selections.map((selection) => [selection.productId, selection]));
    const serialized = this.serializeBatch(batch);
    return {
      ...serialized,
      products: batch.products.map((product) => ({
        ...product,
        imagePreviews: buildProductBatchImagePreviews(
          product.images,
          variantsByProduct.get(product.id) ?? [],
          selectionByProduct.get(product.id) ?? null
        )
      }))
    };
  }

  async listProducts(input: ListInput) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_DIGITALIZE_PAGE);
    const where: Record<string, unknown> = { ...productFactoryVisibilityWhere(input.includeTestData) };
    if (input.queue === "managed") {
      where.status = managedProductStatus(input.status);
    } else {
      if (input.queue) Object.assign(where, this.queueWhere(input.queue));
      if (input.status) where.status = input.status;
    }
    if (input.batchId?.trim()) where.batchId = input.batchId.trim();
    if (input.category?.trim()) where.category = input.category.trim();
    if (input.employeeId?.trim()) where.createdByEmployeeId = input.employeeId.trim();
    if (input.search?.trim()) {
      const search = input.search.trim();
      where.OR = [
        { productCode: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { batch: { is: { batchCode: { contains: search, mode: "insensitive" } } } }
      ];
    }
    if (input.dateFrom || input.dateTo) {
      where.createdAt = {
        ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
        ...(input.dateTo ? { lte: new Date(input.dateTo) } : {})
      };
    }

    const orderBy = [{ batchId: "desc" }, { batchItemNumber: "asc" }, { updatedAt: "desc" }, { id: "asc" }] as const;
    const paging = listPageRequest(input.page, input.pageSize);
    if (!paging) {
      // The intake queues still read one unpaged list, capped as before.
      return prisma.product.findMany({ where, include: this.productInclude(), orderBy: [...orderBy], take: 200 });
    }
    // 商品管理 pages through everything that matches: the total is counted
    // first so a page past the end can be answered with the last page.
    const total = await prisma.product.count({ where });
    const window = listPageWindow(paging, total);
    const items = total
      ? await prisma.product.findMany({ where, include: this.productInclude(), orderBy: [...orderBy], skip: window.skip, take: window.take })
      : [];
    return listPage(items, total, paging);
  }

  async runBatchAi(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const batch = await this.requireBatch(batchId);
    const products = await prisma.product.findMany({
      where: {
        batchId: batch.id,
        status: { in: [ProductStatus.PHOTOGRAPHED, ProductStatus.AI_PROCESSED, ProductStatus.CALIBRATION_PENDING] }
      },
      include: { images: { orderBy: { createdAt: "desc" } }, aiExtractions: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { batchItemNumber: "asc" }
    });

    const results: Array<Record<string, unknown>> = [];
    for (const product of products) {
      if (!product.images.length) {
        results.push({ productId: product.id, status: "SKIPPED", reason: "Missing photo" });
        continue;
      }
      if (
        product.aiExtractions[0]?.status === "SUCCEEDED" &&
        product.aiExtractions[0]?.promptVersion === PRODUCT_AI_PROMPT_VERSION
      ) {
        results.push({ productId: product.id, status: "SKIPPED", reason: "AI already succeeded" });
        continue;
      }
      try {
        const job = await this.aiJobs.submit({
          productId: product.id,
          imageIds: product.images.map((image) => image.id),
          promptVersion: PRODUCT_AI_PROMPT_VERSION
        });
        results.push({ productId: product.id, status: job.status, extractionId: job.extractionId });
      } catch (error) {
        results.push({ productId: product.id, status: "FAILED", reason: error instanceof Error ? error.message : "AI failed" });
      }
    }
    return { batchId, results };
  }

  async listShelves(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, PRODUCT_EDIT_ACTION);
    const [shelves, counts] = await Promise.all([
      prisma.warehouseLocation.findMany({
        where: { active: true, status: { not: WarehouseLocationStatus.INACTIVE } },
        orderBy: { locationCode: "asc" }
      }),
      prisma.inventoryItem.groupBy({
        by: ["locationId"],
        where: { locationId: { not: null }, status: { in: WAREHOUSE_OCCUPYING_STATUSES } },
        _count: { _all: true }
      })
    ]);
    const countByShelf = new Map(counts.map((row) => [row.locationId, row._count._all]));
    return shelves.map((shelf) => {
      const currentItemCount = countByShelf.get(shelf.id) ?? 0;
      return {
        id: shelf.id,
        locationCode: shelf.locationCode,
        capacity: shelf.capacity,
        currentItemCount,
        remainingCapacity: Math.max(0, shelf.capacity - currentItemCount)
      };
    });
  }

  async moveBatchToShelf(batchId: string, input: { adminUserId?: string; employeeId?: string; locationId?: string }) {
    const batch = await this.requireBatch(batchId);
    const products = await prisma.product.findMany({ where: { batchId: batch.id }, select: { id: true, status: true } });
    return this.productControl.moveProductsToShelf(activeBatchProducts(products).map((product) => product.id), { ...input, batchId: batch.id });
  }

  async generateBatchBarcodes(batchId: string, input: { adminUserId?: string; employeeId?: string; locationId?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const batch = await this.requireBatch(batchId);
    const allProducts = await prisma.product.findMany({
      where: { batchId: batch.id },
      orderBy: { batchItemNumber: "asc" }
    });
    // Items rejected on the image review page stay out of every step from here on.
    const products = activeBatchProducts(allProducts);
    if (!batchItemsAccountedFor(batch, allProducts) || products.some((product) =>
      !canGenerateOrReuseBarcode(product.status, product.barcode)
    )) {
      throw new BadRequestException(`All ${batch.targetCount} products must be calibrated before generating barcodes.`);
    }
    // Image approval is a separate employee action, never inferred from printing.
    for (const product of products) {
      if (product.status === ProductStatus.PUBLISHED) continue;
      const image = await loadConfirmedDisplayImage(prisma, product.id);
      if (!image) throw new BadRequestException(`Product ${product.productCode}: Confirm the AI display image before generating barcodes.`);
    }
    const generated = [];
    const generatedAt = new Date();
    for (const product of products) {
      generated.push(product.status === ProductStatus.CALIBRATED
        ? await this.barcodes.generate(product.id, employeeId, generatedAt)
        : product);
    }
    const reserved = await this.productControl.assignBatchLocations(products.map((product) => product.id), input);
    return { batchId, generated, reserved };
  }

  async markBatchPrinted(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const batch = await this.requireBatch(batchId);
    const products = await prisma.product.findMany({
      where: { batchId: batch.id, barcode: { not: null }, status: { not: ProductStatus.ARCHIVED } },
      select: { id: true }
    });
    return this.productControl.markLabelsPrinted({
      adminUserId: input.adminUserId,
      employeeId: input.employeeId,
      productIds: products.map((product) => product.id)
    });
  }

  async stockInBatch(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    const session = await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const employeeId = employeeIdOrDefault(input.employeeId);
    const batch = await this.requireBatch(batchId);
    const allProducts = await prisma.product.findMany({
      where: { batchId: batch.id },
      include: { inventoryItem: true },
      orderBy: { batchItemNumber: "asc" }
    });
    const products = activeBatchProducts(allProducts);
    if (!batchItemsAccountedFor(batch, allProducts) || products.some((product) =>
      product.status !== ProductStatus.READY_FOR_STORAGE && product.status !== ProductStatus.PUBLISHED
    )) {
      throw new BadRequestException(`All ${batch.targetCount} products must be ready for storage.`);
    }
    const pending = products.filter((product) => product.status !== ProductStatus.PUBLISHED);
    if (pending.some((product) => !product.inventoryItem?.locationId)) {
      throw new BadRequestException(`All ${batch.targetCount} products must have assigned shelf locations.`);
    }
    const stocked = [];
    for (const product of pending) {
      stocked.push(await this.productControl.confirmPlaced(product.id, input));
    }
    await prisma.auditLog.create({
      data: {
        actorType: ActorType.EMPLOYEE,
        actorId: employeeId,
        actorAdminUserId: session.adminUser?.id ?? null,
        sourceApp: SourceApp.OPERATIONS,
        module: "WAREHOUSE",
        entityType: "ProductBatch",
        entityId: batch.id,
        action: "WAREHOUSE_BATCH_STOCKED",
        afterJson: { productIds: pending.map((product) => product.id), status: "AVAILABLE" },
        reason: "All assigned products were confirmed stored in one batch action."
      }
    });
    await this.completeBatchIfDone(batch.id);
    return { batchId, stocked };
  }

  async prepareBatchStorage(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION);
    const batch = await this.requireBatch(batchId);
    const allProducts = await prisma.product.findMany({ where: { batchId }, orderBy: { batchItemNumber: "asc" } });
    const products = activeBatchProducts(allProducts);
    if (!batchItemsAccountedFor(batch, allProducts) || products.some((product) =>
      product.status !== ProductStatus.APPROVED && product.status !== ProductStatus.READY_FOR_STORAGE && product.status !== ProductStatus.PUBLISHED
    )) {
      throw new BadRequestException(`All ${batch.targetCount} products must be approved before preparing storage.`);
    }
    const prepared = [];
    const pending = products.filter((product) => product.status !== ProductStatus.PUBLISHED);
    for (const product of pending) {
      prepared.push(await this.productControl.prepareForStorage(product.id, input));
    }
    const reserved = await this.productControl.assignBatchLocations(pending.map((product) => product.id), input);
    return { batchId, prepared, reserved };
  }

  async publishBatch(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    await this.access.requirePermission(input.adminUserId, "action.product.publish");
    const batch = await this.requireBatch(batchId);
    const allProducts = await prisma.product.findMany({
      where: { batchId },
      include: this.productInclude(),
      orderBy: { batchItemNumber: "asc" }
    });
    const products = activeBatchProducts(allProducts);
    if (!batchItemsAccountedFor(batch, allProducts) || products.some((product) =>
      product.status !== ProductStatus.READY_FOR_STORAGE && product.status !== ProductStatus.PUBLISHED
    )) {
      throw new BadRequestException(`All ${batch.targetCount} products must complete storage before publishing.`);
    }
    // Validate the whole unfinished batch before publishing its first item.
    // Completed items may already be reserved or sold and must never be stocked in again.
    for (const product of products) {
      if (product.status !== ProductStatus.PUBLISHED) await this.productControl.assertPublishable(product);
    }
    const published = [];
    for (const product of products) published.push(await this.productControl.publish(product.id, input));
    await this.completeBatchIfDone(batch.id);
    return { batchId, published };
  }

  async completeAndPublishBatch(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await Promise.all([
      this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION),
      this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION),
      this.access.requirePermission(input.adminUserId, "action.product.publish")
    ]);
    const batch = await this.requireBatch(batchId);
    const products = await prisma.product.findMany({
      where: { batchId: batch.id },
      include: this.productInclude(),
      orderBy: { batchItemNumber: "asc" }
    });
    if (products.length !== batch.targetCount) {
      throw new BadRequestException(`Batch must contain exactly ${batch.targetCount} products.`);
    }
    // Rejected (archived) items are finished with; they are neither stocked in nor published.
    const pending = activeBatchProducts(products).filter((product) => product.status !== ProductStatus.PUBLISHED);
    if (pending.length === 0) {
      await this.completeBatchIfDone(batch.id);
      return this.batchDetail(batch.id, input.adminUserId);
    }
    const completableStatuses: ProductStatus[] = [ProductStatus.BARCODE_ASSIGNED, ProductStatus.REVIEW_PENDING,
      ProductStatus.APPROVED, ProductStatus.READY_FOR_STORAGE];
    if (pending.some((product) => !completableStatuses.includes(product.status))) {
      throw new BadRequestException("Every unfinished product must be ready for review or storage before completing the batch.");
    }
    if (pending.some((product) => !product.barcode || !product.labelPrintedAt || !product.inventoryItem?.locationId)) {
      throw new BadRequestException("Generate and print every barcode, then place every item at its reserved shelf location.");
    }
    for (const product of pending) {
      const blocker = productContentBlocker(product);
      if (blocker) throw new BadRequestException(`${product.productCode}: ${blocker}`);
      if (product.inventoryItem?.barcode !== product.barcode ||
        !["PENDING_STOCK_IN", "AVAILABLE"].includes(product.inventoryItem?.status ?? "")) {
        throw new BadRequestException(`Product ${product.productCode} is not eligible for stock-in.`);
      }
      if (product.status === ProductStatus.APPROVED || product.status === ProductStatus.READY_FOR_STORAGE) {
        const mainImage = await loadConfirmedDisplayImage(prisma, product.id);
        const approvalBlocker = productApprovalBlocker(product, mainImage);
        if (approvalBlocker) throw new BadRequestException(`${product.productCode}: ${approvalBlocker}`);
      }
    }

    const reviewable = pending.filter((product) =>
      product.status === ProductStatus.BARCODE_ASSIGNED || product.status === ProductStatus.REVIEW_PENDING
    );
    // Validate all pending items before any approvals or inventory mutations.
    for (const product of reviewable) {
      const image = await loadConfirmedDisplayImage(prisma, product.id);
      if (!image) throw new BadRequestException(`Product ${product.productCode}: Confirm the AI display image on the image review page first.`);
    }

    if (reviewable.length > 0) await this.details.approveBatch(batch.id, employeeId);
    for (const product of reviewable) {
      await this.reviewProduct(product.id, {
        ...input,
        employeeId,
        result: ReviewResult.APPROVED
      });
    }
    await this.prepareBatchStorage(batch.id, { ...input, employeeId });
    await this.stockInBatch(batch.id, { ...input, employeeId });
    await this.publishBatch(batch.id, { ...input, employeeId });
    return this.batchDetail(batch.id, input.adminUserId);
  }

  async reviewProduct(productId: string, input: ReviewInput) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION);
    const result = input.result;
    if (!result || !Object.values(ReviewResult).includes(result)) {
      throw new BadRequestException("Review result is required.");
    }
    if ((result === ReviewResult.REJECTED || result === ReviewResult.REWORK_REQUIRED) && !input.reason?.trim()) {
      throw new BadRequestException("Review reason is required.");
    }

    let product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found.");
    if (product.status !== ProductStatus.BARCODE_ASSIGNED && product.status !== ProductStatus.REVIEW_PENDING) {
      throw new BadRequestException("Only products waiting for review can receive a review decision.");
    }
    if ((product.status === ProductStatus.BARCODE_ASSIGNED || product.status === ProductStatus.REVIEW_PENDING) && !product.labelPrintedAt) {
      throw new BadRequestException("Print the label before reviewing the product.");
    }
    if (result === ReviewResult.APPROVED) {
      const mainSelection = await loadConfirmedDisplayImage(prisma, productId);
      if (!product.barcode || !mainSelection) {
        throw new BadRequestException("Confirm the AI display main image against the original before approving the product.");
      }
    }

    const actor = { actorType: ActorType.EMPLOYEE, actorId: employeeId, sourceApp: SourceApp.OPERATIONS };
    if (product.status === ProductStatus.BARCODE_ASSIGNED) {
      product = await this.products.transitionProduct({ productId, toStatus: ProductStatus.REVIEW_PENDING, actor });
    }

    const review = { result, reviewerEmployeeId: employeeId, reason: input.reason?.trim() || undefined };
    if (result === ReviewResult.APPROVED) {
      await this.products.transitionProduct({ productId, toStatus: ProductStatus.APPROVED, actor, review });
    } else if (result === ReviewResult.REWORK_REQUIRED) {
      await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.REWORK_REQUIRED,
        reason: input.reason,
        actor,
        review
      });
    } else {
      await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.ARCHIVED,
        reason: input.reason,
        actor,
        review
      });
    }

    return prisma.product.findUnique({
      where: { id: productId },
      include: this.productInclude()
    });
  }

  /**
   * Rejects one garment from the white-background review page — for example
   * when no usable display image can be made — so the rest of its batch can go
   * on to labels and publishing without it. The garment is archived through the
   * normal product transition (audit entry plus a REJECTED review) and can be
   * restored later from the rejected list.
   */
  async rejectAtDisplayReview(productId: string, input: { adminUserId?: string; employeeId?: string; reason?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION);
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException("A reason is required to reject this item.");
    const product = await prisma.product.findUnique({ where: { id: productId }, include: { batch: true } });
    if (!product) throw new NotFoundException("Product not found.");
    if (!product.batchId || !product.batch) throw new BadRequestException("Only an item in an intake batch can be rejected here.");
    if (product.batch.status !== ProductBatchStatus.OPEN) throw new BadRequestException("This batch is no longer open.");
    if (!DISPLAY_REVIEW_REJECTABLE_STATUSES.has(product.status)) {
      throw new BadRequestException(
        "Only an item still waiting for its white-background image review can be rejected here. After barcodes are generated, use the review decision instead."
      );
    }
    const actor = { actorType: ActorType.EMPLOYEE, actorId: employeeId, sourceApp: SourceApp.OPERATIONS };
    await this.products.transitionProduct({
      productId,
      toStatus: ProductStatus.ARCHIVED,
      reason: `Rejected at white-background image review (batch ${product.batch.batchCode}): ${reason}`,
      actor,
      review: { result: ReviewResult.REJECTED, reviewerEmployeeId: employeeId, reason }
    });
    await this.completeBatchIfDone(product.batchId);
    return prisma.product.findUnique({ where: { id: productId }, include: this.productInclude() });
  }

  async markProductForRecalibration(productId: string, input: { adminUserId?: string; employeeId?: string; reason?: string }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION);
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException("Recalibration reason is required.");
    let product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found.");
    const actor = {
      actorType: ActorType.EMPLOYEE,
      actorId: employeeIdOrDefault(input.employeeId),
      sourceApp: SourceApp.OPERATIONS
    };
    if (product.status === ProductStatus.BARCODE_ASSIGNED) {
      product = await this.products.transitionProduct({ productId, toStatus: ProductStatus.REVIEW_PENDING, actor });
    }
    if (product.status === ProductStatus.REVIEW_PENDING) {
      product = await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.REWORK_REQUIRED,
        reason,
        actor
      });
    }
    if (product.status === ProductStatus.REWORK_REQUIRED) {
      product = await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.CALIBRATION_PENDING,
        reason,
        actor
      });
    } else if (product.status === ProductStatus.CALIBRATED) {
      product = await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.CALIBRATION_PENDING,
        reason,
        actor
      });
    } else if (product.status !== ProductStatus.CALIBRATION_PENDING) {
      throw new BadRequestException("This product cannot be returned to calibration from its current status.");
    }
    await prisma.productReview.create({
      data: {
        productId,
        reviewerEmployeeId: actor.actorId,
        result: ReviewResult.REWORK_REQUIRED,
        reason
      }
    });
    return prisma.product.findUnique({ where: { id: productId }, include: this.productInclude() });
  }

  async markProductForRetake(productId: string, input: { adminUserId?: string; employeeId?: string; reason?: string }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    if (!input.reason?.trim()) throw new BadRequestException("Retake reason is required.");
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found.");
    const actor = {
      actorType: ActorType.EMPLOYEE,
      actorId: employeeIdOrDefault(input.employeeId),
      sourceApp: SourceApp.OPERATIONS
    };
    await this.products.transitionProduct({
      productId,
      toStatus: ProductStatus.PHOTOGRAPHED,
      reason: input.reason.trim(),
      actor
    });
    return prisma.product.findUnique({ where: { id: productId }, include: this.productInclude() });
  }

  private queueWhere(queue: ProductQueue): Record<string, unknown> {
    if (queue === "all") return {};
    if (queue === "exceptions") return { status: ProductStatus.REWORK_REQUIRED };
    if (queue === "waiting-upload") return { status: ProductStatus.DRAFT };
    if (queue === "waiting-ai") return { status: { in: [ProductStatus.PHOTOGRAPHED, ProductStatus.AI_PROCESSING] } };
    if (queue === "calibration") return { status: { in: [ProductStatus.AI_PROCESSED, ProductStatus.CALIBRATION_PENDING, ProductStatus.CALIBRATED] } };
    if (queue === "review") return { status: { in: [ProductStatus.BARCODE_ASSIGNED, ProductStatus.REVIEW_PENDING, ProductStatus.REWORK_REQUIRED, ProductStatus.APPROVED, ProductStatus.READY_FOR_STORAGE] } };
    if (queue === "published") return { status: ProductStatus.PUBLISHED };
    if (queue === "rejected") return { status: ProductStatus.ARCHIVED };
    if (queue === "barcode") return { status: { in: [ProductStatus.CALIBRATED, ProductStatus.BARCODE_ASSIGNED] } };
    return {};
  }

  /**
   * Stops an intake that will not be finished, as if it was never entered. Unfinished items are
   * deleted with their stock record and their shelf slots are freed; an unfinished item that was
   * ever on a customer order is archived instead. Items that already went live are left untouched.
   * The whole cancellation commits or rolls back as one. With `dryRun` it only reports the plan.
   */
  async cancelBatch(batchId: string, input: { adminUserId?: string; employeeId?: string; reason?: string; dryRun?: boolean }) {
    const session = await this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION);
    const employeeId = employeeIdOrDefault(input.employeeId);
    const reason = input.reason?.trim() ?? "";
    const dryRun = input.dryRun === true;
    const stateMachine = new ProductStateMachine();

    let plan: ReturnType<typeof planBatchCancellation>;
    try {
      plan = await prisma.$transaction(async (transaction) => {
        const batch = await transaction.productBatch.findUnique({ where: { id: batchId } });
        if (!batch) throw new NotFoundException("Product batch not found.");
        const products = await transaction.product.findMany({
          where: { batchId },
          include: { inventoryItem: { include: { location: { select: { locationCode: true } } } } },
          orderBy: { batchItemNumber: "asc" }
        });
        const orderCounts = products.length === 0 ? [] : await transaction.orderItem.groupBy({
          by: ["productId"],
          where: { productId: { in: products.map((product) => product.id) } },
          _count: { _all: true }
        });
        const orderCountById = new Map(orderCounts.map((row) => [row.productId, row._count._all]));
        const cancellation = planBatchCancellation(
          batch,
          products.map((product) => ({ ...product, orderItemCount: orderCountById.get(product.id) ?? 0 })),
          reason,
          { preview: dryRun }
        );
        if (dryRun) return cancellation;

        const deleteIds = cancellation.delete.map((product) => product.id);
        if (deleteIds.length > 0) {
          // If anything moved an item meanwhile (e.g. it was just published), the count misses and
          // the whole cancellation rolls back.
          const deleted = await hardDeleteProducts(transaction, cancellation.delete);
          if (deleted !== deleteIds.length) {
            throw new BatchCancellationError("An item in this batch changed while cancelling. Refresh the batch and try again.");
          }
          await transaction.auditLog.create({
            data: {
              actorType: ActorType.EMPLOYEE,
              actorId: employeeId,
              actorAdminUserId: session.adminUser?.id ?? null,
              sourceApp: SourceApp.OPERATIONS,
              module: "PRODUCT_FACTORY",
              entityType: "ProductBatch",
              entityId: batchId,
              action: "PRODUCT_BATCH_CANCEL_DELETE",
              beforeJson: {
                products: cancellation.delete.map((product) => ({ id: product.id, productCode: product.productCode, status: product.status }))
              },
              afterJson: { deletedProductCodes: cancellation.delete.map((product) => product.productCode) },
              reason: `Batch ${batch.batchCode} cancelled: ${reason}`
            }
          });
        }

        for (const product of cancellation.archive) {
          const rule = stateMachine.assertCanTransition({
            fromStatus: product.status,
            toStatus: ProductStatus.ARCHIVED,
            reason
          });
          // Conditional on the status we planned from: if anything moved the item meanwhile
          // (e.g. it was just published), the update misses and the whole cancellation rolls back.
          const changed = await transaction.product.updateMany({
            where: { id: product.id, status: product.status },
            data: { status: ProductStatus.ARCHIVED }
          });
          if (changed.count !== 1) {
            throw new BatchCancellationError(`${product.productCode} changed while cancelling. Refresh the batch and try again.`);
          }
          await transaction.auditLog.create({
            data: {
              actorType: ActorType.EMPLOYEE,
              actorId: employeeId,
              actorAdminUserId: session.adminUser?.id ?? null,
              sourceApp: SourceApp.OPERATIONS,
              module: "Product",
              entityType: "Product",
              entityId: product.id,
              action: rule.action,
              beforeJson: { status: product.status },
              afterJson: { status: ProductStatus.ARCHIVED, batchId },
              reason: `Batch ${batch.batchCode} cancelled: ${reason}`
            }
          });
        }

        for (const release of cancellation.releases) {
          // A deleted item's stock record went with it; only its shelf count needs refreshing below.
          if (release.deleted) continue;
          await transaction.inventoryItem.update({
            where: { id: release.inventoryItemId },
            data: { locationId: null }
          });
          await transaction.inventoryMovement.create({
            data: {
              inventoryItemId: release.inventoryItemId,
              productId: release.productId,
              movementType: InventoryMovementType.ADJUST,
              fromLocationId: release.locationId,
              employeeId,
              reason: `Shelf released: batch ${batch.batchCode} cancelled (${reason})`
            }
          });
        }
        await refreshWarehouseLocationStatuses(transaction, cancellation.releases.map((release) => release.locationId));

        await transaction.productBatch.update({
          where: { id: batchId },
          data: { status: ProductBatchStatus.CANCELLED }
        });
        await transaction.auditLog.create({
          data: {
            actorType: ActorType.EMPLOYEE,
            actorId: employeeId,
            actorAdminUserId: session.adminUser?.id ?? null,
            sourceApp: SourceApp.OPERATIONS,
            module: "PRODUCT_FACTORY",
            entityType: "ProductBatch",
            entityId: batchId,
            action: "PRODUCT_BATCH_CANCELLED",
            beforeJson: { status: batch.status },
            afterJson: {
              status: ProductBatchStatus.CANCELLED,
              deletedProductIds: deleteIds,
              archivedProductIds: cancellation.archive.map((product) => product.id),
              keptProductIds: cancellation.kept.map((product) => product.id),
              releasedShelves: cancellation.releases.map((release) => ({
                productId: release.productId,
                locationCode: release.locationCode,
                physicallyShelved: release.physicallyShelved
              }))
            },
            reason
          }
        });
        return cancellation;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
    } catch (error) {
      if (error instanceof BatchCancellationError) throw new BadRequestException(error.message);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new BadRequestException("The batch changed while cancelling. Refresh the batch and try again.");
      }
      throw error;
    }

    return {
      batchId,
      status: dryRun ? undefined : ProductBatchStatus.CANCELLED,
      dryRun,
      deletedCount: plan.delete.length,
      archivedCount: plan.archive.length,
      /** Unfinished items kept (archived) because a customer order points at them. */
      archivedProductCodes: plan.archive.map((product) => product.productCode),
      keptCount: plan.kept.length,
      releasedShelves: plan.releases.map((release) => ({
        productCode: release.productCode,
        locationCode: release.locationCode,
        physicallyShelved: release.physicallyShelved
      }))
    };
  }

  /**
   * Undoes an archive, for garments that are still in the warehouse and should be sold after all.
   * Each item goes back to the step it was on before it was archived (read from its archive audit
   * entry). Items archived by a batch cancellation come back together with the rest of that batch,
   * and go back onto the shelf the cancellation took them off when it still has room. With
   * `dryRun` it only reports what would happen.
   */
  async restoreProduct(productId: string, input: { adminUserId?: string; employeeId?: string; reason?: string; dryRun?: boolean }) {
    const session = await this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION);
    const employeeId = employeeIdOrDefault(input.employeeId);
    const reason = input.reason?.trim() ?? "";
    const dryRun = input.dryRun === true;
    if (!dryRun && !reason) throw new BadRequestException("A reason is required to restore a product.");
    const stateMachine = new ProductStateMachine();

    try {
      return await prisma.$transaction(async (transaction) => {
        const product = await transaction.product.findUnique({ where: { id: productId }, include: { batch: true } });
        if (!product) throw new NotFoundException("Product not found.");
        if (product.status !== ProductStatus.ARCHIVED) throw new ProductRestorationError(`${product.productCode} is not archived.`);
        const batch = product.batch;

        let productIds = [product.id];
        if (batch?.status === ProductBatchStatus.CANCELLED) {
          const cancellation = await transaction.auditLog.findFirst({
            where: { module: "PRODUCT_FACTORY", entityType: "ProductBatch", entityId: batch.id, action: "PRODUCT_BATCH_CANCELLED" },
            orderBy: { createdAt: "desc" }
          });
          const archivedIds = stringArray(objectValue(cancellation?.afterJson)?.archivedProductIds);
          if (archivedIds.includes(product.id)) productIds = archivedIds;
        }

        const products = await transaction.product.findMany({
          where: { id: { in: productIds }, status: ProductStatus.ARCHIVED },
          include: { inventoryItem: true },
          orderBy: { batchItemNumber: "asc" }
        });
        const archiveEntries = await transaction.auditLog.findMany({
          where: { module: "Product", entityType: "Product", entityId: { in: products.map((item) => item.id) }, action: "PRODUCT_ARCHIVE" },
          orderBy: { createdAt: "desc" }
        });
        const previousStatusById = new Map<string, ProductStatus | null>();
        for (const entry of archiveEntries) {
          if (!entry.entityId || previousStatusById.has(entry.entityId)) continue;
          previousStatusById.set(entry.entityId, productStatusValue(objectValue(entry.beforeJson)?.status));
        }

        const unshelvedItemIds = products
          .map((item) => item.inventoryItem)
          .filter((item): item is NonNullable<typeof item> => Boolean(item && !item.locationId))
          .map((item) => item.id);
        const releases = unshelvedItemIds.length === 0 ? [] : await transaction.inventoryMovement.findMany({
          where: { inventoryItemId: { in: unshelvedItemIds }, fromLocationId: { not: null }, toLocationId: null },
          include: { fromLocation: true },
          orderBy: { createdAt: "desc" }
        });
        const previousShelfByItem = new Map<string, { id: string; locationCode: string }>();
        for (const release of releases) {
          if (previousShelfByItem.has(release.inventoryItemId) || !release.fromLocation) continue;
          previousShelfByItem.set(release.inventoryItemId, { id: release.fromLocation.id, locationCode: release.fromLocation.locationCode });
        }
        const shelfIds = [...new Set([...previousShelfByItem.values()].map((shelf) => shelf.id))];
        const [shelfRows, shelfCounts] = await Promise.all([
          transaction.warehouseLocation.findMany({ where: { id: { in: shelfIds } } }),
          transaction.inventoryItem.groupBy({
            by: ["locationId"],
            where: { locationId: { in: shelfIds }, status: { in: WAREHOUSE_OCCUPYING_STATUSES } },
            _count: { _all: true }
          })
        ]);
        const countByShelf = new Map(shelfCounts.map((row) => [row.locationId, row._count._all]));

        const plan = planProductRestoration(
          products.map((item) => ({
            id: item.id,
            productCode: item.productCode,
            status: item.status,
            barcode: item.barcode,
            previousStatus: previousStatusById.get(item.id) ?? null,
            inventoryItem: item.inventoryItem
              ? { id: item.inventoryItem.id, status: item.inventoryItem.status, locationId: item.inventoryItem.locationId }
              : null,
            previousShelf: item.inventoryItem ? previousShelfByItem.get(item.inventoryItem.id) ?? null : null
          })),
          shelfRows.map((shelf) => ({
            id: shelf.id,
            locationCode: shelf.locationCode,
            capacity: shelf.capacity,
            currentItemCount: countByShelf.get(shelf.id) ?? 0,
            active: shelf.active && shelf.status !== WarehouseLocationStatus.INACTIVE
          }))
        );
        const reopenBatch = Boolean(batch && batch.status !== ProductBatchStatus.OPEN);
        const summary = {
          batchId: batch?.id ?? null,
          batchCode: batch?.batchCode ?? null,
          batchReopened: reopenBatch,
          restored: plan.restore.map((item) => ({ productCode: item.productCode, status: item.toStatus })),
          shelfReturns: plan.shelfReturns.map((item) => ({
            productCode: item.productCode,
            locationCode: item.locationCode,
            physicallyShelved: item.physicallyShelved
          })),
          needsShelf: plan.needsShelf.map((item) => item.productCode),
          dryRun
        };
        if (dryRun) return summary;

        for (const item of plan.restore) {
          const rule = stateMachine.assertCanRestore({ fromStatus: item.fromStatus, toStatus: item.toStatus, reason });
          const changed = await transaction.product.updateMany({
            where: { id: item.id, status: ProductStatus.ARCHIVED },
            data: { status: item.toStatus }
          });
          if (changed.count !== 1) {
            throw new ProductRestorationError(`${item.productCode} changed while restoring. Refresh and try again.`);
          }
          await transaction.auditLog.create({
            data: {
              actorType: ActorType.EMPLOYEE,
              actorId: employeeId,
              actorAdminUserId: session.adminUser?.id ?? null,
              sourceApp: SourceApp.OPERATIONS,
              module: "Product",
              entityType: "Product",
              entityId: item.id,
              action: rule.action,
              beforeJson: { status: ProductStatus.ARCHIVED },
              afterJson: { status: item.toStatus, batchId: batch?.id ?? null },
              reason
            }
          });
        }

        for (const shelfReturn of plan.shelfReturns) {
          const changed = await transaction.inventoryItem.updateMany({
            where: { id: shelfReturn.inventoryItemId, locationId: null },
            data: { locationId: shelfReturn.locationId }
          });
          if (changed.count !== 1) {
            throw new ProductRestorationError(`${shelfReturn.productCode} changed while restoring. Refresh and try again.`);
          }
          await transaction.inventoryMovement.create({
            data: {
              inventoryItemId: shelfReturn.inventoryItemId,
              productId: shelfReturn.productId,
              movementType: InventoryMovementType.LOCATION_ASSIGNED,
              toLocationId: shelfReturn.locationId,
              employeeId,
              reason: `Shelf restored: product restored (${reason})`
            }
          });
        }
        await refreshWarehouseLocationStatuses(transaction, [...new Set(plan.shelfReturns.map((item) => item.locationId))]);

        if (batch && reopenBatch) {
          await transaction.productBatch.update({ where: { id: batch.id }, data: { status: ProductBatchStatus.OPEN } });
          await transaction.auditLog.create({
            data: {
              actorType: ActorType.EMPLOYEE,
              actorId: employeeId,
              actorAdminUserId: session.adminUser?.id ?? null,
              sourceApp: SourceApp.OPERATIONS,
              module: "PRODUCT_FACTORY",
              entityType: "ProductBatch",
              entityId: batch.id,
              action: "PRODUCT_BATCH_REOPENED",
              beforeJson: { status: batch.status },
              afterJson: { status: ProductBatchStatus.OPEN, restoredProductIds: plan.restore.map((item) => item.id) },
              reason
            }
          });
        }
        return summary;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
    } catch (error) {
      if (error instanceof ProductRestorationError) throw new BadRequestException(error.message);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new BadRequestException("The products changed while restoring. Refresh and try again.");
      }
      throw error;
    }
  }

  private async requireBatch(batchId: string) {
    const batch = await prisma.productBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException("Product batch not found.");
    return batch;
  }

  private async completeBatchIfDone(batchId: string) {
    const remaining = await prisma.product.count({
      where: { batchId, status: { notIn: [ProductStatus.PUBLISHED, ProductStatus.ARCHIVED] } }
    });
    if (remaining === 0) {
      await prisma.productBatch.update({ where: { id: batchId }, data: { status: ProductBatchStatus.COMPLETED } });
    }
  }

  private serializeBatch(batch: {
    id: string;
    batchCode: string;
    status: ProductBatchStatus;
    targetCount: number;
    intakeCategory?: string | null;
    createdByEmployeeId: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    products: Array<{ id: string; status: ProductStatus }>;
  }) {
    const counts = batch.products.reduce<Record<string, number>>((acc, product) => {
      acc[product.status] = (acc[product.status] ?? 0) + 1;
      return acc;
    }, {});
    const flow = deriveProductFactoryBatchFlow(batch.products);
    return {
      id: batch.id,
      batchCode: batch.batchCode,
      status: batch.status,
      targetCount: batch.targetCount,
      intakeCategory: batch.intakeCategory ?? null,
      createdByEmployeeId: batch.createdByEmployeeId,
      note: batch.note,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      completedCount: (counts.PUBLISHED ?? 0) + (counts.ARCHIVED ?? 0),
      ...flow,
      counts,
      products: batch.products
    };
  }

  private productInclude() {
    return {
      batch: true,
      images: { orderBy: { createdAt: "desc" } },
      measurements: { orderBy: { measurementType: "asc" } },
      defects: { orderBy: { createdAt: "asc" } },
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      detailProfiles: {
        orderBy: { sourceDataVersion: "desc" },
        take: 1,
        select: { id: true, status: true, sourceDataVersion: true }
      },
      inventoryItem: {
        include: {
          location: {
            include: {
              _count: {
                select: {
                  inventoryItems: { where: { status: { in: WAREHOUSE_OCCUPYING_STATUSES } } }
                }
              }
            }
          }
        }
      },
      aiExtractions: {
        include: { fieldDecisions: { orderBy: { fieldName: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    } as const;
  }
}

function objectValue(value: Prisma.JsonValue | undefined): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : null;
}

function stringArray(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function productStatusValue(value: Prisma.JsonValue | undefined): ProductStatus | null {
  return typeof value === "string" && (Object.values(ProductStatus) as string[]).includes(value) ? value as ProductStatus : null;
}
