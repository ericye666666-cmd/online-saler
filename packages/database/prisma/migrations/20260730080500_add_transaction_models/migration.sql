-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CheckoutDraftStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'CANCELLED', 'EXPIRED', 'FULFILLING', 'COMPLETED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('PICKUP', 'KIKUYU_LOCAL_DELIVERY');

-- CreateEnum
CREATE TYPE "OrderCurrency" AS ENUM ('KES');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "googleSubjectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "defaultAddress" TEXT,
    "preferredFulfillmentMethod" "FulfillmentMethod",
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "fulfillmentMethod" "FulfillmentMethod" NOT NULL,
    "deliveryAddress" TEXT,
    "deliveryNote" TEXT,
    "itemSubtotalKsh" INTEGER NOT NULL,
    "deliveryFeeKsh" INTEGER NOT NULL DEFAULT 0,
    "totalKsh" INTEGER NOT NULL,
    "currency" "OrderCurrency" NOT NULL DEFAULT 'KES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutDraft" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "CheckoutDraftStatus" NOT NULL DEFAULT 'ACTIVE',
    "fulfillmentMethod" "FulfillmentMethod" NOT NULL DEFAULT 'PICKUP',
    "deliveryAddress" TEXT,
    "deliveryNote" TEXT,
    "itemSubtotalKsh" INTEGER NOT NULL DEFAULT 0,
    "deliveryFeeKsh" INTEGER NOT NULL DEFAULT 0,
    "totalKsh" INTEGER NOT NULL DEFAULT 0,
    "currency" "OrderCurrency" NOT NULL DEFAULT 'KES',
    "expiresAt" TIMESTAMP(3),
    "convertedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitPriceKsh" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lineTotalKsh" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSnapshot" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "barcode" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "brand" TEXT,
    "color" TEXT,
    "sizeLabel" TEXT,
    "conditionGrade" "ConditionGrade",
    "imageUrl" TEXT,
    "measurements" JSONB,
    "defects" JSONB,
    "unitPriceKsh" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_googleSubjectId_key" ON "Customer"("googleSubjectId");
CREATE UNIQUE INDEX "Customer_normalizedEmail_key" ON "Customer"("normalizedEmail");
CREATE INDEX "Customer_status_createdAt_idx" ON "Customer"("status", "createdAt");
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

CREATE UNIQUE INDEX "CheckoutDraft_convertedOrderId_key" ON "CheckoutDraft"("convertedOrderId");
CREATE INDEX "CheckoutDraft_customerId_status_updatedAt_idx" ON "CheckoutDraft"("customerId", "status", "updatedAt");
CREATE INDEX "CheckoutDraft_status_expiresAt_idx" ON "CheckoutDraft"("status", "expiresAt");

CREATE UNIQUE INDEX "OrderItem_orderId_productId_key" ON "OrderItem"("orderId", "productId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

CREATE UNIQUE INDEX "OrderSnapshot_orderItemId_key" ON "OrderSnapshot"("orderItemId");
CREATE INDEX "OrderSnapshot_productCode_idx" ON "OrderSnapshot"("productCode");
CREATE INDEX "OrderSnapshot_barcode_idx" ON "OrderSnapshot"("barcode");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutDraft" ADD CONSTRAINT "CheckoutDraft_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckoutDraft" ADD CONSTRAINT "CheckoutDraft_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderSnapshot" ADD CONSTRAINT "OrderSnapshot_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Transaction invariants
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" = 1);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_unitPriceKsh_check" CHECK ("unitPriceKsh" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_lineTotalKsh_check" CHECK ("lineTotalKsh" = "unitPriceKsh" * "quantity");
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_check" CHECK ("itemSubtotalKsh" >= 0 AND "deliveryFeeKsh" >= 0 AND "totalKsh" = "itemSubtotalKsh" + "deliveryFeeKsh");
ALTER TABLE "CheckoutDraft" ADD CONSTRAINT "CheckoutDraft_amounts_check" CHECK ("itemSubtotalKsh" >= 0 AND "deliveryFeeKsh" >= 0 AND "totalKsh" = "itemSubtotalKsh" + "deliveryFeeKsh");
ALTER TABLE "OrderSnapshot" ADD CONSTRAINT "OrderSnapshot_unitPriceKsh_check" CHECK ("unitPriceKsh" > 0);
