export const STAGING_TEST_PRODUCT_PREFIXES = Object.freeze([
  "DEPLOY-",
  "E2E-",
  "OPENAI-",
  "UPLOAD-",
  "TEST-",
  "CUTOUT-",
  "HEADERTEST-",
  "LOCALOPENAI-"
]);

const BATCH_CODE_PATTERN = /^BATCH-\d+$/;

export function parseBatchCodes(value = "") {
  const codes = [...new Set(value.split(/[;,]/).map((item) => item.trim()).filter(Boolean))];
  const invalid = codes.filter((code) => !BATCH_CODE_PATTERN.test(code));

  if (invalid.length > 0) {
    throw new Error(`Invalid staging test batch code(s): ${invalid.join(", ")}`);
  }

  return codes;
}

export function cleanupMode({ nodeEnv, confirmation }) {
  if (nodeEnv !== "staging") {
    throw new Error("Staging test-data cleanup can only run with NODE_ENV=staging.");
  }

  if (!confirmation || confirmation === "DRY_RUN") return "dry-run";
  if (confirmation === "DELETE_STAGING_TEST_DATA") return "delete";

  throw new Error("Invalid cleanup confirmation. Use DRY_RUN or DELETE_STAGING_TEST_DATA.");
}

export function productCleanupWhere(batchCodes = []) {
  const selectors = STAGING_TEST_PRODUCT_PREFIXES.map((prefix) => ({
    productCode: { startsWith: prefix }
  }));

  if (batchCodes.length > 0) {
    selectors.push({ batch: { batchCode: { in: batchCodes } } });
  }

  return { OR: selectors };
}

export function unauthorizedBatchedProducts(products, batchCodes) {
  const allowed = new Set(batchCodes);
  return products.filter((product) => product.batch && !allowed.has(product.batch.batchCode));
}

export function storageObjectsFromUrls(urls, expectedBucket) {
  const objects = new Set();

  for (const value of urls) {
    if (!value || !value.startsWith("gs://")) continue;

    const withoutScheme = value.slice(5);
    const separator = withoutScheme.indexOf("/");
    const bucket = separator === -1 ? withoutScheme : withoutScheme.slice(0, separator);
    const objectName = separator === -1 ? "" : withoutScheme.slice(separator + 1);

    if (!objectName) continue;
    if (expectedBucket && bucket !== expectedBucket) {
      throw new Error(`Refusing to delete object from unexpected bucket: ${bucket}`);
    }

    objects.add(`${bucket}/${objectName}`);
  }

  return [...objects].sort();
}

export function summarizeProducts(products) {
  const byPrefix = Object.fromEntries(STAGING_TEST_PRODUCT_PREFIXES.map((prefix) => [prefix, 0]));
  let exactBatchProducts = 0;

  for (const product of products) {
    const prefix = STAGING_TEST_PRODUCT_PREFIXES.find((candidate) =>
      product.productCode.startsWith(candidate)
    );
    if (prefix) byPrefix[prefix] += 1;
    if (product.batch) exactBatchProducts += 1;
  }

  return { total: products.length, byPrefix, exactBatchProducts };
}
