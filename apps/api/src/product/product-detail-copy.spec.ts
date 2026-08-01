import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { buildProductDetailFacts } from "./product-detail-generation-runner.service";
import { normalizeProductDetailCopy } from "./product-detail-copy";

describe("product detail copy", () => {
  it("accepts the strict structured output contract", () => {
    const result = normalizeProductDetailCopy({
      title: "Black regular-fit cotton shirt",
      sellingPoints: ["Regular fit", "Four final measurements", "Good condition"],
      shortDescription: "A concise second-hand shirt description.",
      fitSummary: "Regular fit with no recorded stretch.",
      measurementSummary: "Chest width 52 cm and length 70 cm.",
      conditionSummary: "Good condition with a small cuff mark.",
      styleTags: ["shirt", "black"],
      missingInformation: [],
      warnings: ["Compare the flat measurements with a garment you own."]
    });

    assert.equal(result.sellingPoints.length, 3);
    assert.equal(result.title, "Black regular-fit cotton shirt");
  });

  it("rejects incomplete or free-form outputs", () => {
    assert.throws(
      () =>
        normalizeProductDetailCopy({
          title: "Shirt",
          sellingPoints: ["Only one"],
          shortDescription: "Description",
          fitSummary: "Fit",
          measurementSummary: "Measurements",
          conditionSummary: "Condition",
          styleTags: [],
          missingInformation: [],
          warnings: []
        }),
      BadRequestException
    );
  });

  it("builds model facts only from final measurements and confirmed fields", () => {
    const facts = buildProductDetailFacts(
      {
        id: "product-1",
        title: "Confirmed title",
        category: "TOPS",
        subcategory: "SHIRT",
        gender: "UNISEX",
        color: "BLACK",
        pattern: "SOLID",
        sleeveType: "LONG",
        brand: null,
        tagSize: "L",
        finalSizeLabel: "L",
        conditionGrade: "GOOD",
        fitType: "REGULAR",
        stretchLevel: "NONE",
        fabricWeight: "REGULAR",
        priceKsh: 1200,
        measurements: [
          { measurementType: "CHEST_WIDTH", finalValueCm: 52 },
          { measurementType: "SHOULDER_WIDTH", finalValueCm: null }
        ],
        defects: [
          {
            defectType: "MARK",
            severity: "MINOR",
            description: "Small cuff mark",
            customerSafeDescription: "Small mark at cuff"
          }
        ]
      },
      {
        bodyChestMinCm: 96,
        bodyChestMaxCm: 102,
        bodyWaistMinCm: null,
        bodyWaistMaxCm: null,
        bodyHipMinCm: null,
        bodyHipMaxCm: null,
        heightMinCm: 170,
        heightMaxCm: 182,
        weightMinKg: null,
        weightMaxKg: null,
        expectedFit: "regular",
        recommendationConfidence: 0.82,
        recommendationBasis: ["CHEST_WIDTH"],
        recommendationWarnings: [],
        sizeDisclaimer: "Reference only"
      },
      4
    );

    assert.deepEqual(facts.measurementsCm, { CHEST_WIDTH: 52 });
    assert.equal(facts.fitType, "REGULAR");
    assert.equal(facts.fitRecommendation.bodyChestMaxCm, 102);
    assert.equal(facts.sourceDataVersion, 4);
  });
});
