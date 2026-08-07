import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCT_FACTORY_TEST_PREFIXES, productFactoryVisibilityWhere } from "./product-factory-list-filter";

describe("product factory list visibility", () => {
  it("hides deployment and E2E product prefixes by default", () => {
    assert.deepEqual(productFactoryVisibilityWhere(), {
      NOT: {
        OR: PRODUCT_FACTORY_TEST_PREFIXES.map((prefix) => ({
          productCode: { startsWith: prefix }
        }))
      }
    });
  });

  it("allows an explicit admin request to include test data", () => {
    assert.deepEqual(productFactoryVisibilityWhere(true), {});
  });

  it("covers every known staging smoke-test prefix", () => {
    assert.deepEqual(PRODUCT_FACTORY_TEST_PREFIXES, [
      "DEPLOY-",
      "E2E-",
      "OPENAI-",
      "UPLOAD-",
      "TEST-",
      "CUTOUT-",
      "HEADERTEST-",
      "LOCALOPENAI-"
    ]);
  });
});
