import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ActorType, Prisma, ProductStatus, SourceApp, prisma } from "@online-saler/database";
import { ProductStateMachine } from "./product-state-machine";
import { barcodeBusinessDate, barcodePrefix, nextDailyBarcode } from "./product-barcode-format";

const MAX_BARCODE_ASSIGNMENT_ATTEMPTS = 20;

@Injectable()
export class ProductBarcodeService {
  constructor(private readonly stateMachine: ProductStateMachine) {}

  async generate(productId: string, employeeId: string, generatedAt = new Date()) {
    const businessDate = barcodeBusinessDate(generatedAt);
    const prefix = barcodePrefix(businessDate);

    for (let attempt = 0; attempt < MAX_BARCODE_ASSIGNMENT_ATTEMPTS; attempt += 1) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException("Product not found");

      if (product.barcode && product.status === ProductStatus.BARCODE_ASSIGNED) {
        return product;
      }

      const existingBarcodes = product.barcode
        ? []
        : await prisma.product.findMany({
            where: { barcode: { startsWith: prefix } },
            select: { barcode: true }
          });
      const barcode = product.barcode ?? nextDailyBarcode(
        businessDate,
        existingBarcodes.map((candidate) => candidate.barcode)
      );

      this.stateMachine.assertCanTransition({
        fromStatus: product.status,
        toStatus: ProductStatus.BARCODE_ASSIGNED,
        barcode
      });

      try {
        return await prisma.$transaction(async (transaction) => {
          const changed = await transaction.product.updateMany({
            where: {
              id: productId,
              status: product.status,
              barcode: product.barcode
            },
            data: {
              barcode,
              status: ProductStatus.BARCODE_ASSIGNED
            }
          });

          if (changed.count !== 1) {
            const current = await transaction.product.findUnique({ where: { id: productId } });
            if (current?.barcode) return current;
            throw new ConflictException("Product changed while assigning its barcode. Try again.");
          }

          const assigned = await transaction.product.findUniqueOrThrow({ where: { id: productId } });
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
                barcode: assigned.barcode,
                barcodeFormat: "9YYDDDNNNNN"
              }
            }
          });

          return assigned;
        });
      } catch (error) {
        if (!product.barcode && isUniqueConstraintConflict(error)) continue;
        throw error;
      }
    }

    throw new ConflictException("Could not reserve a unique daily barcode. Try again.");
  }

  async getByBarcode(barcode: string) {
    const product = await prisma.product.findUnique({ where: { barcode } });
    if (!product) throw new NotFoundException("Barcode not found");
    return product;
  }
}

function isUniqueConstraintConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
