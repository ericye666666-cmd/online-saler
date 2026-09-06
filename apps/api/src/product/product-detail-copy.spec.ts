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
      fitSummary: "Regular fit with no stretch.",
      conditionSummary: "Good condition with a small cuff mark.",
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
          fitSummary: "Regular fit",
          conditionSummary: "Condition",
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
        material: "COTTON_BLEND",
        tags: ["COLLARED", "BUTTON_FRONT"],
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
    assert.equal(facts.material, "COTTON_BLEND");
    assert.deepEqual(facts.tags, ["COLLARED", "BUTTON_FRONT"]);
    assert.equal("fitRecommendation" in facts, false);
    assert.equal(facts.sourceDataVersion, 4);
  });

  it("keeps original shoe sizes and human insole measurements while discarding stale garment fit facts", () => {
    const product = {
      id: "shoe-1", title: "Used kids shoes", category: "KIDS", subcategory: "KIDS_SHOES",
      gender: "KIDS", color: "BLACK", pattern: "SOLID", sleeveType: "LONG", brand: null,
      tagSize: "32", finalSizeLabel: "L", shoeSizeSystem: "EU", shoeType: "Kids' shoes",
      shoePairConfirmed: true, shoeConditionNotes: "Heel wear and scuff on left toe",
      conditionGrade: "GOOD", fitType: "REGULAR", stretchLevel: "NONE", fabricWeight: "REGULAR",
      material: null, tags: [], priceKsh: 500,
      measurements: [
        { measurementType: "CHEST_WIDTH", finalValueCm: 52, finalSource: "HUMAN_ENTERED" },
        { measurementType: "INSOLE_LENGTH", finalValueCm: 20, finalSource: "HUMAN_ENTERED" }
      ],
      defects: [{ defectType: "SCUFF", severity: "MINOR", description: "Left toe scuff", customerSafeDescription: "Scuff on the left toe" }]
    };
    const facts = buildProductDetailFacts(product, { expectedFit: "L", heightMinCm: 150 }, 5);
    assert.deepEqual(facts.measurementsCm, { INSOLE_LENGTH: 20 });
    assert.equal(facts.platformSize, "EU 32");
    assert.equal(facts.tagSize, "32");
    assert.equal(facts.shoePairConfirmed, true);
    assert.equal(facts.shoeConditionNotes, product.shoeConditionNotes);
    assert.equal(facts.sleeveType, null);
    assert.equal(facts.fitType, null);
    assert.equal(facts.stretchLevel, null);
    assert.equal(facts.fabricWeight, null);
    assert.equal(facts.defects[0]?.description, "Left toe scuff");
    assert.equal("fitRecommendation" in facts, false);

    const unknown = buildProductDetailFacts({ ...product, tagSize: "unreadable", shoeSizeSystem: null,
      measurements: [{ measurementType: "INSOLE_LENGTH", finalValueCm: 20, finalSource: "AI_ACCEPTED" }] }, {}, 6);
    assert.equal(unknown.platformSize, null);
    assert.deepEqual(unknown.measurementsCm, {});
  });
});
