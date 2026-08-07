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
      ["TSHIRTS", "TSHIRT", "TOP_SHORT_SLEEVE"],
      ["TOPS", "HOODIE", "TOP_LONG_SLEEVE"],
      ["DRESSES", "DRESS", "DRESS_SHORT_SLEEVE"],
      ["PANTS", "JEANS", "PANTS"],
      ["SHORT", "CASUAL_SHORTS", "SHORTS"],
      ["SKIRTS", "MIDI_SKIRT", "SKIRT"],
      ["JACKETS", "OUTDOOR_JACKET", "OUTERWEAR_JACKET"],
      ["KIDS", "KIDS_TOP", "KIDS_TOP_SHORT_SLEEVE"],
      ["KIDS", "KIDS_JACKET", "KIDS_OUTERWEAR"],
      ["KIDS", "KIDS_PANTS", "KIDS_PANTS"],
      ["SETS", "TWO_PIECE_SET", "TWO_PIECE_SET"],
      ["FULL_BODY", "JUMPSUIT", "JUMPSUIT_ROMPER"],
      ["BABY", "ONESIE", "BABY_ONESIE"],
      ["SWIMWEAR", "ONE_PIECE_SWIM", "BODYSUIT_SWIMWEAR"],
      ["COATS", "TRENCH_COAT", "LONG_COAT_TRENCH"],
      ["OTHER", null, "GENERIC_GARMENT"]
    ];
    for (const [category, subcategory, expected] of cases) {
      assert.equal(selectMeasurementTemplate(category, subcategory), expected);
    }
    assert.equal(selectMeasurementTemplate("DRESSES", "MIDI_DRESSES", "SLEEVELESS"), "DRESS_SLEEVELESS");
    assert.equal(selectMeasurementTemplate("DRESSES", "MIDI_DRESSES", "LONG"), "DRESS_LONG_SLEEVE");
    assert.equal(selectMeasurementTemplate("KIDS", "KIDS_TOP", "LONG"), "KIDS_TOP_LONG_SLEEVE");
  });

  it("renders a separate 1200px measurement guide without a product photo", async () => {
    const body = await new ProductDetailCardRendererService().measurementCard({
      template: "TOP_SHORT_SLEEVE",
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
      eyebrow: "Delivery",
      title: "Collection and delivery",
      rows: [{ label: "Checkout", value: "Confirm the available option" }],
      note: "Contact support if the received item differs from the approved listing."
    });
    const metadata = await sharp(body).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
  });

});
