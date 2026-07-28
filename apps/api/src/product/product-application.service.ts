import { Inject, Injectable } from "@nestjs/common";
import { ProductStatus } from "@online-saler/database";
import { productNotFound, stateConflict } from "./product.errors";
import { PRODUCT_REPOSITORY, type ProductRepository } from "./product.repository";
import { ProductStateMachine } from "./product-state-machine";
import type {
  CreateProductShellInput,
  OperationsProductDetailQuery,
  ProductRecord,
  ProductStateSnapshot,
  ProductTransitionCommand
} from "./product.types";

@Injectable()
export class ProductApplicationService {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    private readonly stateMachine: ProductStateMachine
  ) {}

  async createProductShell(input: CreateProductShellInput): Promise<ProductRecord> {
    return this.products.createShell(input);
  }

  async getOperationsProductDetail(query: OperationsProductDetailQuery) {
    const product = query.id
      ? await this.products.findById(query.id)
      : query.productCode
        ? await this.products.findByProductCode(query.productCode)
        : null;

    if (!product) {
      throw productNotFound("Product was not found.", query);
    }

    return product;
  }

  async transitionProduct(command: ProductTransitionCommand): Promise<ProductRecord> {
    const product = await this.products.findById(command.productId);

    if (!product) {
      throw productNotFound("Product was not found.", { productId: command.productId });
    }

    const rule = this.stateMachine.assertCanTransition({
      fromStatus: product.status,
      toStatus: command.toStatus,
      reason: command.reason,
      barcode: command.barcode,
      inventoryAvailable: command.inventoryAvailable
    });

    if (command.toStatus === ProductStatus.BARCODE_ASSIGNED) {
      await this.assertBarcodeIsAvailable(product.id, command.barcode?.trim() ?? "");
    }

    const saveData = {
      status: command.toStatus,
      ...this.getTransitionSideEffects(product, command)
    };

    const after = this.snapshot({
      status: command.toStatus,
      barcode: saveData.barcode ?? product.barcode
    });

    return this.products.saveStateChange({
      id: product.id,
      data: saveData,
      audit: {
        actor: command.actor,
        module: "Product",
        entityType: "Product",
        entityId: product.id,
        action: rule.action,
        before: this.snapshot(product),
        after,
        reason: command.reason
      }
    });
  }

  private async assertBarcodeIsAvailable(productId: string, barcode: string): Promise<void> {
    const existing = await this.products.findByBarcode(barcode);

    if (existing && existing.id !== productId) {
      throw stateConflict("Formal barcode is already assigned.", {
        productId,
        barcode,
        assignedProductId: existing.id
      });
    }
  }

  private getTransitionSideEffects(
    product: ProductRecord,
    command: ProductTransitionCommand
  ): {
    barcode?: string;
    publishedAt?: Date | null;
    unpublishedAt?: Date | null;
  } {
    if (command.toStatus === ProductStatus.BARCODE_ASSIGNED) {
      const barcode = command.barcode?.trim();

      if (!barcode) {
        throw stateConflict("Formal barcode is required for barcode assignment.", {
          productId: product.id
        });
      }

      return { barcode };
    }

    if (command.toStatus === ProductStatus.PUBLISHED) {
      return {
        publishedAt: new Date(),
        unpublishedAt: null
      };
    }

    if (command.toStatus === ProductStatus.UNPUBLISHED) {
      return {
        unpublishedAt: new Date()
      };
    }

    return {};
  }

  private snapshot(product: Pick<ProductRecord, "status" | "barcode">): ProductStateSnapshot {
    return {
      status: product.status,
      barcode: product.barcode
    };
  }
}
