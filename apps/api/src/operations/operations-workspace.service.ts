import { BadRequestException, Injectable } from "@nestjs/common";
import { ProductStatus, prisma } from "@online-saler/database";

export const STAGING_TEST_EMPLOYEE_ID = "00000000-0000-4000-8000-000000000001";

const ACTIVE_PRODUCT_STATUSES = [
  ProductStatus.DRAFT,
  ProductStatus.PHOTOGRAPHED,
  ProductStatus.AI_PROCESSING,
  ProductStatus.AI_PROCESSED,
  ProductStatus.CALIBRATION_PENDING,
  ProductStatus.CALIBRATED
] as const;

function employeeIdOrDefault(employeeId?: string): string {
  return employeeId?.trim() || STAGING_TEST_EMPLOYEE_ID;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function productCode(): string {
  return `OPS-${Date.now()}`;
}

@Injectable()
export class OperationsWorkspaceService {
  async summary(employeeId?: string) {
    const operatorId = employeeIdOrDefault(employeeId);
    const today = startOfToday();

    const [waitingPhoto, waitingAi, waitingCalibration, completedToday, active] =
      await Promise.all([
        prisma.product.count({
          where: {
            createdByEmployeeId: operatorId,
            status: ProductStatus.DRAFT
          }
        }),
        prisma.product.count({
          where: {
            createdByEmployeeId: operatorId,
            status: { in: [ProductStatus.PHOTOGRAPHED, ProductStatus.AI_PROCESSING] }
          }
        }),
        prisma.product.count({
          where: {
            createdByEmployeeId: operatorId,
            status: { in: [ProductStatus.AI_PROCESSED, ProductStatus.CALIBRATION_PENDING, ProductStatus.CALIBRATED] }
          }
        }),
        prisma.product.count({
          where: {
            createdByEmployeeId: operatorId,
            status: ProductStatus.BARCODE_ASSIGNED,
            updatedAt: { gte: today }
          }
        }),
        this.findActiveProduct(operatorId)
      ]);

    return {
      employeeId: operatorId,
      waitingPhoto,
      waitingAi,
      waitingCalibration,
      completedToday,
      activeProductId: active?.id ?? null
    };
  }

  async active(employeeId?: string, productId?: string) {
    const operatorId = employeeIdOrDefault(employeeId);
    const product = productId
      ? await this.findProductDetail(productId, operatorId)
      : await this.findActiveProduct(operatorId);

    return {
      employeeId: operatorId,
      product,
      latestImage: product?.images[0] ?? null,
      latestExtraction: product?.aiExtractions[0] ?? null
    };
  }

  async start(employeeId?: string) {
    const operatorId = employeeIdOrDefault(employeeId);
    const active = await this.findActiveProduct(operatorId);
    if (active) {
      return {
        employeeId: operatorId,
        product: active,
        latestImage: active.images[0] ?? null,
        latestExtraction: active.aiExtractions[0] ?? null,
        reused: true
      };
    }

    const product = await prisma.product.create({
      data: {
        productCode: productCode(),
        createdByEmployeeId: operatorId
      }
    });

    return {
      employeeId: operatorId,
      product: await this.findProductDetail(product.id, operatorId),
      latestImage: null,
      latestExtraction: null,
      reused: false
    };
  }

  private async findActiveProduct(employeeId: string) {
    return prisma.product.findFirst({
      where: {
        createdByEmployeeId: employeeId,
        status: { in: [...ACTIVE_PRODUCT_STATUSES] }
      },
      include: this.detailInclude(),
      orderBy: { updatedAt: "desc" }
    });
  }

  private async findProductDetail(productId: string, employeeId: string) {
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        createdByEmployeeId: employeeId
      },
      include: this.detailInclude()
    });

    if (!product) {
      throw new BadRequestException("Work item was not found for this operator");
    }

    return product;
  }

  private detailInclude() {
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
      aiExtractions: {
        include: {
          fieldDecisions: {
            orderBy: { fieldName: "asc" }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    } as const;
  }
}
