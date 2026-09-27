import { ProductStatus } from "@online-saler/database";
import { stateConflict } from "./product.errors";

export type ProductTransitionContext = {
  fromStatus: ProductStatus;
  toStatus: ProductStatus;
  reason?: string;
  barcode?: string;
  inventoryAvailable?: boolean;
};

export type ProductTransitionRule = {
  fromStatus: ProductStatus;
  toStatus: ProductStatus;
  action: string;
  reasonRequired?: boolean;
  barcodeRequired?: boolean;
  inventoryAvailableRequired?: boolean;
};

const DIRECT_RULES: ProductTransitionRule[] = [
  {
    fromStatus: ProductStatus.DRAFT,
    toStatus: ProductStatus.PHOTOGRAPHED,
    action: "PRODUCT_MARK_PHOTOGRAPHED"
  },
  {
    fromStatus: ProductStatus.PHOTOGRAPHED,
    toStatus: ProductStatus.AI_PROCESSING,
    action: "PRODUCT_START_AI_PROCESSING"
  },
  {
    fromStatus: ProductStatus.AI_PROCESSING,
    toStatus: ProductStatus.AI_PROCESSED,
    action: "PRODUCT_COMPLETE_AI_PROCESSING"
  },
  {
    fromStatus: ProductStatus.AI_PROCESSED,
    toStatus: ProductStatus.CALIBRATION_PENDING,
    action: "PRODUCT_OPEN_CALIBRATION"
  },
  {
    fromStatus: ProductStatus.CALIBRATION_PENDING,
    toStatus: ProductStatus.CALIBRATED,
    action: "PRODUCT_MARK_CALIBRATED"
  },
  {
    fromStatus: ProductStatus.CALIBRATED,
    toStatus: ProductStatus.CALIBRATION_PENDING,
    action: "PRODUCT_REOPEN_CALIBRATION",
    reasonRequired: true
  },
  {
    fromStatus: ProductStatus.CALIBRATION_PENDING,
    toStatus: ProductStatus.PHOTOGRAPHED,
    action: "PRODUCT_RETAKE_PHOTOS",
    reasonRequired: true
  },
  {
    fromStatus: ProductStatus.CALIBRATED,
    toStatus: ProductStatus.BARCODE_ASSIGNED,
    action: "PRODUCT_ASSIGN_BARCODE",
    barcodeRequired: true
  },
  {
    fromStatus: ProductStatus.BARCODE_ASSIGNED,
    toStatus: ProductStatus.REVIEW_PENDING,
    action: "PRODUCT_SUBMIT_REVIEW"
  },
  {
    fromStatus: ProductStatus.REVIEW_PENDING,
    toStatus: ProductStatus.APPROVED,
    action: "PRODUCT_APPROVE_REVIEW"
  },
  {
    fromStatus: ProductStatus.REVIEW_PENDING,
    toStatus: ProductStatus.REWORK_REQUIRED,
    action: "PRODUCT_REQUEST_REWORK",
    reasonRequired: true
  },
  {
    fromStatus: ProductStatus.REWORK_REQUIRED,
    toStatus: ProductStatus.PHOTOGRAPHED,
    action: "PRODUCT_REWORK_PHOTOS",
    reasonRequired: true
  },
  {
    fromStatus: ProductStatus.REWORK_REQUIRED,
    toStatus: ProductStatus.CALIBRATION_PENDING,
    action: "PRODUCT_REWORK_CALIBRATION",
    reasonRequired: true
  },
  {
    fromStatus: ProductStatus.APPROVED,
    toStatus: ProductStatus.READY_FOR_STORAGE,
    action: "PRODUCT_MARK_READY_FOR_STORAGE"
  },
  {
    fromStatus: ProductStatus.READY_FOR_STORAGE,
    toStatus: ProductStatus.PUBLISHED,
    action: "PRODUCT_PUBLISH",
    inventoryAvailableRequired: true
  },
  {
    fromStatus: ProductStatus.PUBLISHED,
    toStatus: ProductStatus.UNPUBLISHED,
    action: "PRODUCT_UNPUBLISH",
    reasonRequired: true
  },
  {
    fromStatus: ProductStatus.UNPUBLISHED,
    toStatus: ProductStatus.PUBLISHED,
    action: "PRODUCT_REPUBLISH",
    inventoryAvailableRequired: true
  }
];

// Intake steps an archived garment may be restored to. Never AI_PROCESSING (the job is gone) and
// never a live status (publishing has its own checks).
const RESTORABLE_STATUSES: ReadonlySet<ProductStatus> = new Set([
  ProductStatus.DRAFT,
  ProductStatus.PHOTOGRAPHED,
  ProductStatus.AI_PROCESSED,
  ProductStatus.CALIBRATION_PENDING,
  ProductStatus.CALIBRATED,
  ProductStatus.BARCODE_ASSIGNED,
  ProductStatus.REVIEW_PENDING,
  ProductStatus.REWORK_REQUIRED,
  ProductStatus.APPROVED,
  ProductStatus.READY_FOR_STORAGE
]);

export class ProductStateMachine {
  assertCanTransition(context: ProductTransitionContext): ProductTransitionRule {
    if (context.fromStatus === context.toStatus) {
      throw stateConflict("Product is already in the requested state.", {
        fromStatus: context.fromStatus,
        toStatus: context.toStatus
      });
    }

    if (context.fromStatus === ProductStatus.ARCHIVED) {
      throw stateConflict("Archived products cannot return to normal states.", {
        fromStatus: context.fromStatus,
        toStatus: context.toStatus
      });
    }

    if (context.toStatus === ProductStatus.ARCHIVED) {
      return this.requireTransitionConditions(
        {
          fromStatus: context.fromStatus,
          toStatus: ProductStatus.ARCHIVED,
          action: "PRODUCT_ARCHIVE",
          reasonRequired: true
        },
        context
      );
    }

    const rule = DIRECT_RULES.find(
      (candidate) =>
        candidate.fromStatus === context.fromStatus && candidate.toStatus === context.toStatus
    );

    if (!rule) {
      throw stateConflict("Product state transition is not allowed.", {
        fromStatus: context.fromStatus,
        toStatus: context.toStatus
      });
    }

    return this.requireTransitionConditions(rule, context);
  }

  /**
   * The one way out of ARCHIVED: an explicit restore, back to the intake step the garment was on
   * before it was archived. Normal transitions still refuse to leave ARCHIVED.
   */
  assertCanRestore(context: { fromStatus: ProductStatus; toStatus: ProductStatus; reason?: string }): ProductTransitionRule {
    if (context.fromStatus !== ProductStatus.ARCHIVED) {
      throw stateConflict("Only archived products can be restored.", context);
    }
    if (!RESTORABLE_STATUSES.has(context.toStatus)) {
      throw stateConflict("Archived products can only return to an intake step.", context);
    }
    return this.requireTransitionConditions(
      { fromStatus: ProductStatus.ARCHIVED, toStatus: context.toStatus, action: "PRODUCT_RESTORE", reasonRequired: true },
      context
    );
  }

  private requireTransitionConditions(
    rule: ProductTransitionRule,
    context: ProductTransitionContext
  ): ProductTransitionRule {
    if (rule.reasonRequired && !context.reason?.trim()) {
      throw stateConflict("Product state transition requires a reason.", {
        fromStatus: context.fromStatus,
        toStatus: context.toStatus
      });
    }

    if (rule.barcodeRequired && !context.barcode?.trim()) {
      throw stateConflict("Formal barcode is required for this transition.", {
        fromStatus: context.fromStatus,
        toStatus: context.toStatus
      });
    }

    if (rule.inventoryAvailableRequired && context.inventoryAvailable !== true) {
      throw stateConflict("Publishing requires available inventory.", {
        fromStatus: context.fromStatus,
        toStatus: context.toStatus
      });
    }

    return rule;
  }
}
