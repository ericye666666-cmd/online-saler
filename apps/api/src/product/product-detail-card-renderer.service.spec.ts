import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  ProductDetailCardRendererService,
  selectMeasurementTemplate,
  type MeasurementTemplate
} from "./product-detail-card-renderer.service";

describe("ProductDetailCardRendererService", () => {
  it("selects every fixed garment template and keeps a generic top fallback", () => {
    const cases: Array<[string | null, string | null, MeasurementTemplate]> = [
      ["TOPS", "TSHIRT", "TOP_TEMPLATE"],
      ["DRESSES", "DRESS", "DRESS_TEMPLATE"],
      ["PANTS", "JEANS", "PANTS_TEMPLATE"],
      ["JACKETS", "OUTDOOR_JACKET", "JACKET_TEMPLATE"],
      ["KIDS", "KIDS_TOP", "KIDS_TOP_TEMPLATE"],
      ["KIDS", "KIDS_PANTS", "KIDS_PANTS_TEMPLATE"],
      ["OTHER", null, "TOP_TEMPLATE"]
    ];
    for (const [category, subcategory, expected] of cases) {
      assert.equal(selectMeasurementTemplate(category, subcategory), expected);
    }
  });

  it("renders a separate 1200px measurement guide without a product photo", async () => {
    const body = await new ProductDetailCardRendererService().measurementCard({
      template: "TOP_TEMPLATE",
      title: "Black shirt",
      measurements: { LENGTH: 70, CHEST_WIDTH: 52, SHOULDER_WIDTH: 44, SLEEVE_LENGTH: 61 }
    });
    const metadata = await sharp(body).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
  });

  it("renders deterministic Satori information cards through Sharp", async () => {
    const body = await new ProductDetailCardRendererService().informationCard({
      eyebrow: "Fit guide",
      title: "Regular fit",
      rows: [{ label: "Suggested chest", value: "96-102 cm" }],
      note: "Compare with a garment you own."
    });
    const metadata = await sharp(body).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
  });
});
