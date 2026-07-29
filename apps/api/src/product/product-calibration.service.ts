import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AIFieldDecisionSource,
  ConditionGrade,
  DefectSeverity,
  MeasurementSource,
  ProductStatus,
  Prisma,
  prisma
} from "@online-saler/database";
import { ProductStateMachine } from "./product-state-machine";

export interface CalibrationMeasurementInput {
  type: string;
  valueCm: number;
}

export interface CalibrationDefectInput {
  type: string;
  severity: DefectSeverity;
  description: string;
  customerSafeDescription?: string;
  imageId?: string;
}

export interface CalibrateProductInput {
  employeeId: string;
  extractionId: string;
  title: string;
  category: string;
  color: string;
  pattern: string;
  sleeveType: string;
  brand?: string;
  sizeLabel?: string;
  conditionGrade: ConditionGrade;
  measurements: CalibrationMeasurementInput[];
  defects: CalibrationDefectInput[];
}

@Injectable()
export class ProductCalibrationService {
  constructor(private readonly stateMachine: ProductStateMachine) {}

  async calibrate(productId: string, input: CalibrateProductInput) {
    this.validate(input);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found");

    const extraction = await prisma.aIExtraction.findFirst({
      where: { id: input.extractionId, productId },
      include: { fieldDecisions: true }
    });
    if (!extraction) throw new NotFoundException("AI extraction not found for product");

    this.stateMachine.assertCanTransition({
      fromStatus: product.status,
      toStatus: ProductStatus.CALIBRATED
    });

    const reviewedAt = new Date();
    const finalFields: Record<string, string | null> = {
      title: input.title,
      category: input.category,
      primaryColor: input.color,
      pattern: input.pattern,
      sleeveType: input.sleeveType,
      brandLabel: input.brand ?? null,
      sizeLabel: input.sizeLabel ?? null
    };

    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.product.update({
        where: { id: productId },
        data: {
          title: input.title,
          category: input.category,
          color: input.color,
          brand: input.brand ?? null,
          finalSizeLabel: input.sizeLabel ?? null,
          conditionGrade: input.conditionGrade,
          status: ProductStatus.CALIBRATED
        }
      }),
      prisma.productMeasurement.deleteMany({ where: { productId } }),
      prisma.productDefect.deleteMany({ where: { productId } })
    ];

    for (const [fieldName, finalValue] of Object.entries(finalFields)) {
      const decision = extraction.fieldDecisions.find((item) => item.fieldName === fieldName);
      operations.push(
        prisma.aIFieldDecision.upsert({
          where: { extractionId_fieldName: { extractionId: extraction.id, fieldName } },
          create: {
            extractionId: extraction.id,
            fieldName,
            finalValueJson: finalValue === null ? Prisma.JsonNull : finalValue,
            source: AIFieldDecisionSource.HUMAN_ENTERED,
            requiresHumanConfirmation: false,
            reviewedByEmployeeId: input.employeeId,
            reviewedAt
          },
          update: {
            finalValueJson: finalValue === null ? Prisma.JsonNull : finalValue,
            source:
              decision?.aiValueJson === finalValue
                ? AIFieldDecisionSource.HUMAN_ACCEPTED
                : AIFieldDecisionSource.HUMAN_EDITED,
            requiresHumanConfirmation: false,
            reviewedByEmployeeId: input.employeeId,
            reviewedAt
          }
        })
      );
    }

    for (const measurement of input.measurements) {
      operations.push(
        prisma.productMeasurement.create({
          data: {
            productId,
            measurementType: measurement.type,
            finalValueCm: measurement.valueCm,
            finalSource: MeasurementSource.HUMAN_ENTERED,
            reviewedByEmployeeId: input.employeeId,
            reviewedAt
          }
        })
      );
    }

    for (const defect of input.defects) {
      operations.push(
        prisma.productDefect.create({
          data: {
            productId,
            defectType: defect.type,
            severity: defect.severity,
            description: defect.description,
            customerSafeDescription: defect.customerSafeDescription,
            imageId: defect.imageId
          }
        })
      );
    }

    await prisma.$transaction(operations);

    return prisma.product.findUnique({
      where: { id: productId },
      include: { measurements: true, defects: true, aiExtractions: { include: { fieldDecisions: true } } }
    });
  }

  private validate(input: CalibrateProductInput): void {
    if (!input.employeeId || !input.extractionId) {
      throw new BadRequestException("employeeId and extractionId are required");
    }
    if (!input.title?.trim() || !input.category?.trim() || !input.color?.trim()) {
      throw new BadRequestException("title, category and color are required");
    }
    if (!input.conditionGrade) {
      throw new BadRequestException("conditionGrade must be confirmed by an employee");
    }
    if (!Array.isArray(input.measurements)) {
      throw new BadRequestException("measurements must be confirmed by an employee");
    }
    if (!Array.isArray(input.defects)) {
      throw new BadRequestException("defects must be confirmed by an employee, use [] when none");
    }
    if (input.measurements.some((item) => !item.type?.trim() || !Number.isFinite(item.valueCm) || item.valueCm <= 0)) {
      throw new BadRequestException("each measurement requires a type and positive valueCm");
    }
  }
}
