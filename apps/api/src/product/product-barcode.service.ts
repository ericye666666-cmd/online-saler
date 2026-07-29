import { Injectable, NotFoundException } from "@nestjs/common";
import { ActorType, ProductStatus, SourceApp, prisma } from "@online-saler/database";
import { ProductStateMachine } from "./product-state-machine";

@Injectable()
export class ProductBarcodeService {
  constructor(private readonly stateMachine: ProductStateMachine) {}

  async generate(productId: string, employeeId: string) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found");

    if (product.barcode && product.status === ProductStatus.BARCODE_ASSIGNED) {
      return product;
    }

    const barcode = product.barcode ?? this.buildBarcode(product.productCode);

    this.stateMachine.assertCanTransition({
      fromStatus: product.status,
      toStatus: ProductStatus.BARCODE_ASSIGNED,
      barcode
    });

    const updated = await prisma.$transaction(async (transaction) => {
      const assigned = await transaction.product.update({
        where: { id: productId },
        data: {
          barcode,
          status: ProductStatus.BARCODE_ASSIGNED
        }
      });

      await transaction.auditLog.create({
        data: {
          actorType: ActorType.EMPLOYEE,
          actorId: employeeId,
          sourceApp: SourceApp.OPERATIONS,
          module: "PRODUCT",
          entityType: "Product",
          entityId: productId,
          action: "PRODUCT_ASSIGN_BARCODE",
          beforeJson: {
            status: product.status,
            barcode: product.barcode
          },
          afterJson: {
            status: assigned.status,
            barcode: assigned.barcode
          }
        }
      });

      return assigned;
    });

    return updated;
  }

  async getByBarcode(barcode: string) {
    const product = await prisma.product.findUnique({ where: { barcode } });
    if (!product) throw new NotFoundException("Barcode not found");
    return product;
  }

  private buildBarcode(productCode: string): string {
    const normalized = productCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return `DLF${normalized}`;
  }
}
