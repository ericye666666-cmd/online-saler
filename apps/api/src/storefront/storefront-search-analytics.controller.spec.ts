import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { normalizeSearchEvent } from "./storefront-search-analytics.controller";

test("normalizes an anonymous storefront search event", () => {
  assert.deepEqual(
    normalizeSearchEvent({ query: "  Grey   Hoodie ", resultCount: 7, category: "Jackets" }),
    { keyword: "grey hoodie", resultCount: 7, category: "Jackets" }
  );
});

test("rejects empty searches and invalid result counts", () => {
  assert.throws(() => normalizeSearchEvent({ query: " ", resultCount: 0 }), BadRequestException);
  assert.throws(() => normalizeSearchEvent({ query: "jeans", resultCount: -1 }), BadRequestException);
  assert.throws(() => normalizeSearchEvent({ query: "jeans", resultCount: 1.5 }), BadRequestException);
});

test("limits stored dimensions and does not accept arbitrary payload fields", () => {
  const result = normalizeSearchEvent({
    query: `  ${"A".repeat(150)}  `,
    resultCount: 12,
    category: "T".repeat(120),
    email: "not-stored@example.com"
  } as never);

  assert.equal(result.keyword.length, 100);
  assert.equal(result.category?.length, 80);
  assert.deepEqual(Object.keys(result).sort(), ["category", "keyword", "resultCount"]);
});
