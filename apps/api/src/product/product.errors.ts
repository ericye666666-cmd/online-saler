export type ProductDomainErrorCode = "STATE_CONFLICT" | "NOT_FOUND";

export class ProductDomainError extends Error {
  constructor(
    public readonly code: ProductDomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ProductDomainError";
  }
}

export function stateConflict(message: string, details?: Record<string, unknown>): ProductDomainError {
  return new ProductDomainError("STATE_CONFLICT", message, details);
}

export function productNotFound(message: string, details?: Record<string, unknown>): ProductDomainError {
  return new ProductDomainError("NOT_FOUND", message, details);
}
