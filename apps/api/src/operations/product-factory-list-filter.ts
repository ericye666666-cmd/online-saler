export const PRODUCT_FACTORY_TEST_PREFIXES = [
  "DEPLOY-",
  "E2E-",
  "OPENAI-",
  "UPLOAD-",
  "TEST-",
  "CUTOUT-",
  "HEADERTEST-",
  "LOCALOPENAI-"
] as const;

export function productFactoryVisibilityWhere(includeTestData = false): Record<string, unknown> {
  if (includeTestData) return {};

  return {
    NOT: {
      OR: PRODUCT_FACTORY_TEST_PREFIXES.map((prefix) => ({
        productCode: { startsWith: prefix }
      }))
    }
  };
}
