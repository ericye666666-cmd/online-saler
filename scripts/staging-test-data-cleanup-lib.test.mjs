import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanupMode,
  parseBatchCodes,
  productCleanupWhere,
  STAGING_TEST_PRODUCT_PREFIXES,
  storageObjectsFromUrls,
  unauthorizedBatchedProducts
} from "./staging-test-data-cleanup-lib.mjs";

describe("staging test-data cleanup safeguards", () => {
  it("accepts only exact generated batch codes", () => {
    assert.deepEqual(parseBatchCodes("BATCH-123; BATCH-456,BATCH-123"), ["BATCH-123", "BATCH-456"]);
    assert.throws(() => parseBatchCodes("BATCH-*"), /Invalid staging test batch code/);
    assert.throws(() => parseBatchCodes("production-batch"), /Invalid staging test batch code/);
  });

  it("requires staging and an exact delete confirmation", () => {
    assert.equal(cleanupMode({ nodeEnv: "staging", confirmation: "" }), "dry-run");
    assert.equal(cleanupMode({ nodeEnv: "staging", confirmation: "DRY_RUN" }), "dry-run");
    assert.equal(
      cleanupMode({ nodeEnv: "staging", confirmation: "DELETE_STAGING_TEST_DATA" }),
      "delete"
    );
    assert.throws(() => cleanupMode({ nodeEnv: "production", confirmation: "DRY_RUN" }), /only run/);
    assert.throws(() => cleanupMode({ nodeEnv: "staging", confirmation: "yes" }), /Invalid cleanup/);
  });

  it("selects only known prefixes and exact allowlisted batches", () => {
    assert.deepEqual(productCleanupWhere(["BATCH-123"]), {
      OR: [
        ...STAGING_TEST_PRODUCT_PREFIXES.map((prefix) => ({
          productCode: { startsWith: prefix }
        })),
        { batch: { batchCode: { in: ["BATCH-123"] } } }
      ]
    });
  });

  it("rejects prefix candidates that belong to an unapproved batch", () => {
    const unsafe = unauthorizedBatchedProducts(
      [
        { productCode: "DEPLOY-1", batch: null },
        { productCode: "E2E-2", batch: { batchCode: "BATCH-999" } },
        { productCode: "E2E-3", batch: { batchCode: "BATCH-123" } }
      ],
      ["BATCH-123"]
    );

    assert.deepEqual(unsafe.map((item) => item.productCode), ["E2E-2"]);
  });

  it("deduplicates storage objects and enforces the staging bucket", () => {
    assert.deepEqual(
      storageObjectsFromUrls(
        [
          "gs://staging-bucket/products/a.png",
          "gs://staging-bucket/products/a.png",
          "https://example.test/public.png",
          null
        ],
        "staging-bucket"
      ),
      ["staging-bucket/products/a.png"]
    );

    assert.throws(
      () => storageObjectsFromUrls(["gs://production-bucket/products/a.png"], "staging-bucket"),
      /unexpected bucket/
    );
  });
});
