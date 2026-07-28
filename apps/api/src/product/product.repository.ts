import type {
  CreateProductShellInput,
  ProductDetail,
  ProductRecord,
  SaveProductInput,
  SaveProductStateChangeInput
} from "./product.types";

export const PRODUCT_REPOSITORY = Symbol("PRODUCT_REPOSITORY");

export interface ProductRepository {
  createShell(input: CreateProductShellInput): Promise<ProductRecord>;
  findById(id: string): Promise<ProductDetail | null>;
  findByProductCode(productCode: string): Promise<ProductDetail | null>;
  findByBarcode(barcode: string): Promise<ProductRecord | null>;
  save(input: SaveProductInput): Promise<ProductRecord>;
  saveStateChange(input: SaveProductStateChangeInput): Promise<ProductRecord>;
}
