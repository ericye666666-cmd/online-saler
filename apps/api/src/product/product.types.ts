import type {
  ActorType,
  AIExtraction,
  Product,
  ProductDefect,
  ProductImage,
  ProductMeasurement,
  ProductReview,
  ProductStatus,
  SourceApp
} from "@online-saler/database";

export type ProductActor = {
  actorType: ActorType;
  actorId?: string;
  sourceApp: SourceApp;
};

export type ProductRecord = Product;

export type ProductDetail = Product & {
  images: ProductImage[];
  measurements: ProductMeasurement[];
  aiExtractions: AIExtraction[];
  defects: ProductDefect[];
  reviews: ProductReview[];
};

export type ProductStateSnapshot = {
  status: ProductStatus;
  barcode: string | null;
};

export type CreateProductShellInput = {
  productCode: string;
  title?: string;
  actor?: ProductActor;
  createdByEmployeeId?: string;
};

export type ProductSaveData = {
  title?: string | null;
  updatedAt?: Date;
};

export type ProductStateChangeData = ProductSaveData & {
  status: ProductStatus;
  barcode?: string | null;
  publishedAt?: Date | null;
  unpublishedAt?: Date | null;
};

export type SaveProductInput = {
  id: string;
  data: ProductSaveData;
};

export type ProductAuditEntry = {
  actor: ProductActor;
  module: "Product";
  entityType: "Product";
  entityId: string;
  action: string;
  before: ProductStateSnapshot | null;
  after: ProductStateSnapshot;
  reason?: string;
};

export type SaveProductStateChangeInput = Omit<SaveProductInput, "data"> & {
  data: ProductStateChangeData;
  audit: ProductAuditEntry;
};

export type ProductTransitionCommand = {
  productId: string;
  toStatus: ProductStatus;
  actor: ProductActor;
  reason?: string;
  barcode?: string;
  inventoryAvailable?: boolean;
};

export type OperationsProductDetailQuery = {
  id?: string;
  productCode?: string;
};
