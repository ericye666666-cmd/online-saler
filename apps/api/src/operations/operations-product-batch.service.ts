import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ActorType,
  ProductDetailStatus,
  ProductBatchStatus,
  ProductStatus,
  ReviewResult,
  SourceApp,
  prisma
} from "@online-saler/database";
import { PRODUCT_AI_PROMPT_VERSION } from "@online-saler/shared-types";
import { AIJobService } from "../ai/ai-job.service";
import { ProductApplicationService } from "../product/product-application.service";
import { ProductBarcodeService } from "../product/product-barcode.service";
import { ProductDetailGenerationService } from "../product/product-detail-generation.service";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsProductControlService } from "./operations-product-control.service";
import { STAGING_TEST_EMPLOYEE_ID } from "./operations-workspace.service";
import { deriveProductFactoryBatchFlow, startOfDayAtUtcOffset } from "./product-factory-batch-flow";
import {
  PRODUCTION_PRODUCT_BATCH_SIZE,
  isAllowedProductBatchSize,
  stagingPilotBatchEnabled
} from "./product-factory-batch-size";
import { productFactoryVisibilityWhere } from "./product-factory-list-filter";
import { buildProductBatchImagePreviews } from "./product-batch-image-preview";

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
  | "barcode";

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
    private readonly details: ProductDetailGenerationService
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

  async createBatch(input: { adminUserId?: string; employeeId?: string; targetCount?: number; note?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_CREATE_ACTION);
    const targetCount = input.targetCount ?? PRODUCTION_PRODUCT_BATCH_SIZE;
    const pilotEnabled = stagingPilotBatchEnabled();
    if (!isAllowedProductBatchSize(targetCount, pilotEnabled)) {
      throw new BadRequestException(
        pilotEnabled
          ? "Staging batches must contain exactly 3 or 10 products."
          : "The production batch workflow creates exactly 10 products."
      );
    }

    const code = batchCode();
    const batch = await prisma.$transaction(async (transaction) => {
      const created = await transaction.productBatch.create({
        data: {
          batchCode: code,
          targetCount,
          createdByEmployeeId: employeeId,
          note: input.note?.trim() || null
        }
      });

      await transaction.product.createMany({
        data: Array.from({ length: targetCount }, (_, index) => ({
          productCode: `${code}-${String(index + 1).padStart(2, "0")}`,
          batchId: created.id,
          batchItemNumber: index + 1,
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
    if (input.queue) Object.assign(where, this.queueWhere(input.queue));
    if (input.status) where.status = input.status;
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

    return prisma.product.findMany({
      where,
      include: this.productInclude(),
      orderBy: [{ batchId: "desc" }, { batchItemNumber: "asc" }, { updatedAt: "desc" }],
      take: 200
    });
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

  async generateBatchBarcodes(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    const employeeId = employeeIdOrDefault(input.employeeId);
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const batch = await this.requireBatch(batchId);
    const products = await prisma.product.findMany({
      where: { batchId: batch.id },
      orderBy: { batchItemNumber: "asc" }
    });
    if (products.length !== batch.targetCount || products.some((product) => product.status !== ProductStatus.CALIBRATED)) {
      throw new BadRequestException(`All ${batch.targetCount} products must be calibrated before generating barcodes.`);
    }
    const generated = [];
    const generatedAt = new Date();
    for (const product of products) {
      generated.push(await this.barcodes.generate(product.id, employeeId, generatedAt));
    }
    return { batchId, generated };
  }

  async markBatchPrinted(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const batch = await this.requireBatch(batchId);
    const products = await prisma.product.findMany({
      where: { batchId: batch.id, barcode: { not: null } },
      select: { id: true }
    });
    return this.productControl.markLabelsPrinted({
      adminUserId: input.adminUserId,
      employeeId: input.employeeId,
      productIds: products.map((product) => product.id)
    });
  }

  async stockInBatch(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const batch = await this.requireBatch(batchId);
    const products = await prisma.product.findMany({
      where: { batchId: batch.id },
      include: { inventoryItem: true },
      orderBy: { batchItemNumber: "asc" }
    });
    if (products.length !== batch.targetCount || products.some((product) =>
      product.status !== ProductStatus.READY_FOR_STORAGE && product.status !== ProductStatus.PUBLISHED
    )) {
      throw new BadRequestException(`All ${batch.targetCount} products must be ready for storage.`);
    }
    if (products.some((product) => !product.inventoryItem?.locationId)) {
      throw new BadRequestException(`All ${batch.targetCount} products must have assigned shelf locations.`);
    }
    const stocked = [];
    for (const product of products) {
      stocked.push(await this.productControl.confirmPlaced(product.id, input));
    }
    await this.completeBatchIfDone(batch.id);
    return { batchId, stocked };
  }

  async prepareBatchStorage(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION);
    const batch = await this.requireBatch(batchId);
    const products = await prisma.product.findMany({ where: { batchId }, orderBy: { batchItemNumber: "asc" } });
    if (products.length !== batch.targetCount || products.some((product) =>
      product.status !== ProductStatus.APPROVED && product.status !== ProductStatus.READY_FOR_STORAGE
    )) {
      throw new BadRequestException(`All ${batch.targetCount} products must be approved before preparing storage.`);
    }
    const prepared = [];
    for (const product of products) {
      await this.productControl.prepareForStorage(product.id, input);
      prepared.push(await this.productControl.assignRandomLocation(product.id, input));
    }
    return { batchId, prepared };
  }

  async publishBatch(batchId: string, input: { adminUserId?: string; employeeId?: string }) {
    await this.access.requirePermission(input.adminUserId, "action.product.publish");
    const batch = await this.requireBatch(batchId);
    const products = await prisma.product.findMany({
      where: { batchId },
      include: {
        ...this.productInclude(),
        detailProfiles: {
          where: { status: ProductDetailStatus.APPROVED },
          select: { sourceDataVersion: true }
        }
      },
      orderBy: { batchItemNumber: "asc" }
    });
    if (products.length !== batch.targetCount || products.some((product) =>
      (product.status !== ProductStatus.READY_FOR_STORAGE && product.status !== ProductStatus.PUBLISHED) ||
      product.inventoryItem?.status !== "AVAILABLE" ||
      !product.inventoryItem.locationId
    )) {
      throw new BadRequestException(`All ${batch.targetCount} products must complete storage before publishing.`);
    }
    if (products.some((product) => !product.detailProfiles.some(
      (profile) => profile.sourceDataVersion === product.detailSourceVersion
    ))) {
      throw new BadRequestException(`All ${batch.targetCount} products must have approved current detail pages before publishing.`);
    }
    const published = [];
    for (const product of products) published.push(await this.productControl.publish(product.id, input));
    await this.completeBatchIfDone(batch.id);
    return { batchId, published };
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
    if ((product.status === ProductStatus.BARCODE_ASSIGNED || product.status === ProductStatus.REVIEW_PENDING) && !product.labelPrintedAt) {
      throw new BadRequestException("Print the label before reviewing the product.");
    }

    const actor = { actorType: ActorType.EMPLOYEE, actorId: employeeId, sourceApp: SourceApp.OPERATIONS };
    if (product.status === ProductStatus.BARCODE_ASSIGNED) {
      product = await this.products.transitionProduct({ productId, toStatus: ProductStatus.REVIEW_PENDING, actor });
    }

    await prisma.productReview.create({
      data: {
        productId,
        reviewerEmployeeId: employeeId,
        result,
        reason: input.reason?.trim() || null
      }
    });

    if (result === ReviewResult.APPROVED) {
      await this.products.transitionProduct({ productId, toStatus: ProductStatus.APPROVED, actor });
    } else if (result === ReviewResult.REWORK_REQUIRED) {
      await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.REWORK_REQUIRED,
        reason: input.reason,
        actor
      });
    } else {
      await this.products.transitionProduct({
        productId,
        toStatus: ProductStatus.ARCHIVED,
        reason: input.reason,
        actor
      });
    }

    return prisma.product.findUnique({
      where: { id: productId },
      include: this.productInclude()
    });
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
        select: { status: true, sourceDataVersion: true }
      },
      inventoryItem: { include: { location: true } },
      aiExtractions: {
        include: { fieldDecisions: { orderBy: { fieldName: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    } as const;
  }
}
