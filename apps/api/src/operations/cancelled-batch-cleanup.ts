import { BadRequestException, Body, Controller, Headers, Injectable, Post } from "@nestjs/common";
import { ActorType, InventoryItemStatus, Prisma, ProductBatchStatus, ProductStatus, SourceApp, prisma } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsRequestIdentity } from "./operations-request-identity";
import { hardDeleteProducts } from "./product-hard-delete";
import { refreshWarehouseLocationStatuses } from "./warehouse-capacity";
import { STAGING_TEST_EMPLOYEE_ID } from "./operations-workspace.service";

/**
 * ONE-OFF CLEANUP (2026-09-28). Before a cancelled batch deleted its unfinished items, cancelling
 * archived them, so they still show as "Rejected". The owner decided those should be deleted too,
 * by the owner pressing the button. Only items a batch cancellation archived are listed; an item
 * rejected at review stays. Remove this file, its registration in operations.module.ts, the spec
 * and apps/operations/src/app/product/cancelled-batch-cleanup-dialog.tsx once it has been used.
 */

const PRODUCT_APPROVE_ACTION = "action.product.approve";

/** Inventory an archived garment may hold without a customer being involved. */
const DELETABLE_INVENTORY_STATUSES: ReadonlySet<InventoryItemStatus> = new Set([
  InventoryItemStatus.PENDING_STOCK_IN,
  InventoryItemStatus.AVAILABLE
]);

export type CleanupCandidate = {
  id: string;
  productCode: string;
  title: string | null;
  status: ProductStatus;
  batchCode: string;
  orderItemCount: number;
  inventoryStatus: InventoryItemStatus | null;
};

export type CleanupPlan = {
  delete: CleanupCandidate[];
  /** Items the cancellation archived that stay, with the reason. */
  skipped: Array<{ productCode: string; reason: string }>;
};

/** Candidates are the items each cancelled batch's cancellation entry says it archived. */
export function planCancelledBatchCleanup(candidates: readonly CleanupCandidate[]): CleanupPlan {
  const plan: CleanupPlan = { delete: [], skipped: [] };
  for (const candidate of candidates) {
    if (candidate.status !== ProductStatus.ARCHIVED) continue; // restored since, or otherwise moved on
    if (candidate.orderItemCount > 0) {
      plan.skipped.push({ productCode: candidate.productCode, reason: "It was on a customer order." });
    } else if (candidate.inventoryStatus && !DELETABLE_INVENTORY_STATUSES.has(candidate.inventoryStatus)) {
      plan.skipped.push({ productCode: candidate.productCode, reason: `Its stock is ${candidate.inventoryStatus}.` });
    } else {
      plan.delete.push(candidate);
    }
  }
  return plan;
}

function archivedIdsFrom(afterJson: Prisma.JsonValue): string[] {
  if (!afterJson || typeof afterJson !== "object" || Array.isArray(afterJson)) return [];
  const ids = (afterJson as Record<string, unknown>).archivedProductIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

@Injectable()
export class CancelledBatchCleanupService {
  constructor(private readonly access: OperationsAccessService) {}

  /**
   * Lists (dryRun) or deletes the items batch cancellations archived. Deleting needs
   * `expectedCount` to match the list the owner confirmed, so nothing they did not see goes.
   */
  async run(input: { adminUserId?: string; employeeId?: string; dryRun?: boolean; expectedCount?: number }) {
    const session = await this.access.requirePermission(input.adminUserId, PRODUCT_APPROVE_ACTION);
    const employeeId = input.employeeId?.trim() || STAGING_TEST_EMPLOYEE_ID;
    const dryRun = input.dryRun === true;

    try {
      return await prisma.$transaction(async (transaction) => {
        const batches = await transaction.productBatch.findMany({
          where: { status: ProductBatchStatus.CANCELLED },
          select: { id: true, batchCode: true }
        });
        const cancellations = batches.length === 0 ? [] : await transaction.auditLog.findMany({
          where: {
            module: "PRODUCT_FACTORY",
            entityType: "ProductBatch",
            entityId: { in: batches.map((batch) => batch.id) },
            action: "PRODUCT_BATCH_CANCELLED"
          },
          orderBy: { createdAt: "desc" }
        });
        // The latest cancellation entry per batch says which items that cancellation archived.
        const archivedByBatch = new Map<string, string[]>();
        for (const entry of cancellations) {
          if (entry.entityId && !archivedByBatch.has(entry.entityId)) archivedByBatch.set(entry.entityId, archivedIdsFrom(entry.afterJson));
        }
        const batchCodeById = new Map(batches.map((batch) => [batch.id, batch.batchCode]));
        const archivedIds = [...archivedByBatch.values()].flat();

        const products = archivedIds.length === 0 ? [] : await transaction.product.findMany({
          where: { id: { in: archivedIds }, batchId: { in: batches.map((batch) => batch.id) } },
          include: { inventoryItem: true },
          orderBy: [{ createdAt: "asc" }, { batchItemNumber: "asc" }]
        });
        const orderCounts = products.length === 0 ? [] : await transaction.orderItem.groupBy({
          by: ["productId"],
          where: { productId: { in: products.map((product) => product.id) } },
          _count: { _all: true }
        });
        const orderCountById = new Map(orderCounts.map((row) => [row.productId, row._count._all]));
        const plan = planCancelledBatchCleanup(products.map((product) => ({
          id: product.id,
          productCode: product.productCode,
          title: product.title,
          status: product.status,
          batchCode: batchCodeById.get(product.batchId ?? "") ?? "",
          orderItemCount: orderCountById.get(product.id) ?? 0,
          inventoryStatus: product.inventoryItem?.status ?? null
        })));

        const summary = {
          products: plan.delete.map((item) => ({ productCode: item.productCode, title: item.title, batchCode: item.batchCode })),
          skipped: plan.skipped,
          dryRun
        };
        if (dryRun) return summary;
        if (input.expectedCount !== plan.delete.length) {
          throw new BadRequestException("The list changed. Open the cleanup dialog again and check the list.");
        }

        const deleteIds = new Set(plan.delete.map((item) => item.id));
        const shelfIds = [...new Set(products
          .filter((product) => deleteIds.has(product.id) && product.inventoryItem?.locationId)
          .map((product) => product.inventoryItem!.locationId!))];
        const deleted = await hardDeleteProducts(transaction, plan.delete);
        if (deleted !== plan.delete.length) {
          throw new BadRequestException("Some items changed while deleting. Refresh and try again.");
        }
        await refreshWarehouseLocationStatuses(transaction, shelfIds);
        await transaction.auditLog.create({
          data: {
            actorType: ActorType.EMPLOYEE,
            actorId: employeeId,
            actorAdminUserId: session.adminUser?.id ?? null,
            sourceApp: SourceApp.OPERATIONS,
            module: "PRODUCT_FACTORY",
            entityType: "ProductBatch",
            entityId: null,
            action: "PRODUCT_BATCH_CANCEL_DELETE",
            beforeJson: {
              products: plan.delete.map((item) => ({ id: item.id, productCode: item.productCode, batchCode: item.batchCode }))
            },
            afterJson: { deletedProductCodes: plan.delete.map((item) => item.productCode), cleanup: "cancelled-batch-leftovers" },
            reason: "Cleanup: items archived by earlier batch cancellations"
          }
        });
        return summary;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new BadRequestException("The items changed while deleting. Refresh and try again.");
      }
      throw error;
    }
  }
}

@Controller("operations/product-batches/cancelled-cleanup")
export class CancelledBatchCleanupController {
  constructor(private readonly cleanup: CancelledBatchCleanupService, private readonly identity: OperationsRequestIdentity) {}

  @Post()
  async run(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: { adminUserId?: string; employeeId?: string; dryRun?: boolean; expectedCount?: number }
  ) {
    return this.cleanup.run(await this.identity.employeeInput(authorization, body));
  }
}
