import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.MVP_INTEGRATION_DATABASE_URL;

test("shoe batch, human calibration and guarded approval/publication persist in the database", { skip: !databaseUrl, timeout: 120_000 }, async (t) => {
  const target = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  assert.match(target.pathname, /test|ci/i);
  process.env.DATABASE_URL = databaseUrl;
  const { prisma, ProductStatus, ActorType, SourceApp } = await import("@online-saler/database");
  const { ProductCalibrationService } = await import("../../apps/api/src/product/product-calibration.service");
  const { ProductStateMachine } = await import("../../apps/api/src/product/product-state-machine");
  const { PrismaProductRepository } = await import("../../apps/api/src/product/prisma-product.repository");
  const { OperationsProductBatchService } = await import("../../apps/api/src/operations/operations-product-batch.service");
  const { OperationsProductControlService } = await import("../../apps/api/src/operations/operations-product-control.service");
  t.after(async () => { await prisma.$disconnect(); });
  const key = `shoe-${randomUUID()}`;
  const employee = await prisma.employee.create({ data: { employeeCode: key, name: "Shoe intake test employee" } });
  const access = { requirePermission: async () => ({ adminUser: { id: "local-test", linkedEmployeeId: employee.id } }) };
  const batches = new OperationsProductBatchService(access as never, {} as never, {} as never, {} as never,
    {} as never, { ensureBatchGenerationJobs: async () => undefined } as never, {} as never);
  const batch = await batches.createBatch({ employeeId: employee.id, targetCount: 10, intakeCategory: "SHOES" });
  const storedBatch = await prisma.productBatch.findUniqueOrThrow({
    where: { id: batch.id }, include: { products: { orderBy: { batchItemNumber: "asc" } } }
  });
  assert.equal(storedBatch.intakeCategory, "SHOES");
  assert.equal(storedBatch.products.length, 10);
  assert.deepEqual(storedBatch.products.map((product) => product.batchItemNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(storedBatch.products.map((product) => product.productCode)).size, 10);
  assert.ok(storedBatch.products.every((product) => product.category === "SHOES" && product.barcode === null && product.shoePairConfirmed === false));
  const apparel = await batches.createBatch({ employeeId: employee.id, targetCount: 10 });
  assert.equal(apparel.intakeCategory, null);
  assert.ok(apparel.products.every((product) => product.category === null));

  const productId = storedBatch.products[0].id;
  const extraction = await prisma.aIExtraction.create({ data: {
    productId, status: "SUCCEEDED", fieldDecisions: { create: { fieldName: "sizeLabel", aiValueJson: "L" } }
  } });
  await prisma.product.update({ where: { id: productId }, data: {
    status: "CALIBRATION_PENDING", category: "KIDS", subcategory: "KIDS_SHOES", kidsAgeRange: "KIDS_6_8Y",
    measurements: { create: { measurementType: "CHEST_WIDTH", aiValueCm: 42, finalValueCm: 42, finalSource: "AI_ACCEPTED" } }
  } });
  const input = {
    employeeId: employee.id, extractionId: extraction.id, title: "Blue kids sneakers", category: "KIDS",
    subcategory: "KIDS_SHOES", color: "BLUE", gender: "KIDS" as const,
    pattern: "STRIPED", sleeveType: "LONG", fitType: "REGULAR" as const,
    stretchLevel: "LOW" as const, fabricWeight: "HEAVY" as const, material: "CANVAS", tags: ["CASUAL"],
    tagSize: "EU 32", sizeLabel: "L", ukSizeLabel: "UK 6-8Y", shoeSizeSystem: "EU", shoeType: "Sneakers",
    shoePairConfirmed: true, shoeConditionNotes: "Light sole wear; no visible separation.",
    conditionGrade: "GOOD" as const, priceKsh: 750,
    measurements: [{ type: "CHEST_WIDTH", valueCm: 42 }, { type: "INSOLE_LENGTH", valueCm: 20.5 }], defects: []
  };
  const calibration = new ProductCalibrationService(new ProductStateMachine());
  await assert.rejects(calibration.calibrate(productId, { ...input, shoePairConfirmed: false }), /matching pair/);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).status, "CALIBRATION_PENDING");
  await calibration.calibrate(productId, input);
  const calibrated = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { measurements: true } });
  assert.equal(calibrated.status, "CALIBRATED");
  assert.equal(calibrated.category, "SHOES");
  assert.equal(calibrated.tagSize, "EU 32");
  assert.equal(calibrated.finalSizeLabel, "EU 32");
  assert.equal(calibrated.shoeSizeSystem, "EU");
  assert.equal(calibrated.shoeType, "Sneakers");
  assert.equal(calibrated.shoePairConfirmed, true);
  assert.equal(calibrated.shoeConditionNotes, input.shoeConditionNotes);
  assert.equal(calibrated.kidsAgeRange, null);
  assert.equal(calibrated.ukSizeLabel, null);
  assert.equal(calibrated.fitType, "UNKNOWN");
  const chest = calibrated.measurements.find((measurement) => measurement.measurementType === "CHEST_WIDTH")!;
  assert.equal(chest.finalValueCm, null);
  assert.equal(Number(chest.aiValueCm), 42, "AI evidence remains intact even when an irrelevant final value is cleared");
  const insole = calibrated.measurements.find((measurement) => measurement.measurementType === "INSOLE_LENGTH")!;
  assert.equal(Number(insole.finalValueCm), 20.5);
  assert.equal(insole.finalSource, "HUMAN_ENTERED");
  assert.equal(insole.reviewedByEmployeeId, employee.id);
  const pairDecision = await prisma.aIFieldDecision.findUniqueOrThrow({
    where: { extractionId_fieldName: { extractionId: extraction.id, fieldName: "shoePairConfirmed" } }
  });
  assert.equal(pairDecision.finalValueJson, true);
  assert.equal(pairDecision.reviewedByEmployeeId, employee.id);

  const now = new Date();
  const barcode = `PAIR-${key}`;
  await prisma.product.update({ where: { id: productId }, data: { status: "REVIEW_PENDING", barcode, labelPrintedAt: now } });
  await prisma.productImage.createMany({ data: (["FRONT", "BACK", "DETAIL"] as const).map((type) => ({
    productId, type, originalUrl: `https://example.invalid/${key}/${type}.jpg`
  })) });
  const front = await prisma.productImage.findFirstOrThrow({ where: { productId, type: "FRONT" } });
  const display = await prisma.productImageVariantAsset.create({ data: {
    productId, sourceImageId: front.id, variant: "AI_DISPLAY_MAIN", storageUrl: `https://example.invalid/${key}/display.jpg`
  } });
  await prisma.productMainImageSelection.create({ data: { productId, selectedImageId: display.id, variant: "AI_DISPLAY_MAIN", confirmedAt: now } });
  const repository = new PrismaProductRepository();
  const approval = {
    id: productId, data: { status: ProductStatus.APPROVED },
    review: { result: "APPROVED" as const, reviewerEmployeeId: employee.id },
    audit: {
      actor: { actorType: ActorType.EMPLOYEE, actorId: employee.id, sourceApp: SourceApp.OPERATIONS },
      module: "Product" as const, entityType: "Product" as const, entityId: productId, action: "PRODUCT_APPROVE_REVIEW",
      before: { status: ProductStatus.REVIEW_PENDING, barcode }, after: { status: ProductStatus.APPROVED, barcode }
    }
  };
  await assert.rejects(repository.saveStateChange(approval), /LABEL/);
  assert.equal(await prisma.productReview.count({ where: { productId } }), 0);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).status, "REVIEW_PENDING");
  await prisma.productImage.create({ data: { productId, type: "LABEL", originalUrl: `https://example.invalid/${key}/label.jpg` } });
  await repository.saveStateChange(approval);
  assert.equal(await prisma.productReview.count({ where: { productId, result: "APPROVED" } }), 1);
  const location = await prisma.warehouseLocation.create({ data: { locationCode: key } });
  await prisma.inventoryItem.create({ data: { productId, barcode, status: "AVAILABLE", locationId: location.id, checkedInAt: now } });
  await prisma.product.update({ where: { id: productId }, data: { status: "READY_FOR_STORAGE" } });
  const controls = new OperationsProductControlService({ transitionProduct: async (command: { productId: string }) => {
    assert.equal(command.productId, productId);
    return repository.saveStateChange({
      id: productId, data: { status: ProductStatus.PUBLISHED, publishedAt: now },
      audit: { ...approval.audit, action: "PRODUCT_PUBLISH", before: { status: ProductStatus.READY_FOR_STORAGE, barcode }, after: { status: ProductStatus.PUBLISHED, barcode } }
    });
  } } as never, access as never);
  await controls.publish(productId, { employeeId: employee.id });
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).status, "PUBLISHED");
  assert.equal(await prisma.inventoryItem.count({ where: { productId } }), 1, "one shoe pair is one inventory item");
});
