export type ProductMeasurementRequirementInput = {
  category?: string | null;
  subcategory?: string | null;
  sleeveType?: string | null;
};

export type RequiredProductMeasurementType =
  | "LENGTH"
  | "OUTSEAM"
  | "CHEST_WIDTH"
  | "SHOULDER_WIDTH"
  | "SLEEVE_LENGTH"
  | "WAIST"
  | "HIP"
  | "THIGH_WIDTH"
  | "LEG_OPENING"
  | "INSEAM";

const NON_APPAREL_CATEGORIES = new Set(["SHOES", "BAG", "OTHERS", "TEXTILE", "OTHER"]);

export function requiredProductMeasurementTypes(
  input: ProductMeasurementRequirementInput
): RequiredProductMeasurementType[] {
  const category = input.category?.trim().toUpperCase() ?? "";
  const subcategory = input.subcategory?.trim().toUpperCase() ?? "";
  const sleeveType = input.sleeveType?.trim().toUpperCase() ?? "";
  const value = `${category} ${subcategory}`;
  const isPants = category === "PANTS" || category === "SHORT" ||
    (category === "KIDS" && subcategory === "KIDS_PANTS");

  if (isPants) {
    return ["OUTSEAM", "WAIST", "HIP", "THIGH_WIDTH", "LEG_OPENING"];
  }

  const isSkirt = category === "SKIRTS" || category === "SKIRT" || subcategory.includes("SKIRT");
  if (isSkirt) return ["LENGTH", "WAIST", "HIP"];

  if (NON_APPAREL_CATEGORIES.has(category)) return [];

  const upperBody: RequiredProductMeasurementType[] = ["LENGTH", "CHEST_WIDTH", "SHOULDER_WIDTH"];
  if (sleeveType !== "SLEEVELESS" && sleeveType !== "NOT_APPLICABLE") {
    upperBody.push("SLEEVE_LENGTH");
  }

  const isDress = category === "DRESSES" ||
    (category === "KIDS" && subcategory === "KIDS_DRESS");
  const isJumpsuit = ["JUMPSUIT", "ROMPER", "OVERALL", "DUNGAREE"].some((token) => value.includes(token));
  if (isJumpsuit) return [...upperBody, "WAIST", "HIP", "INSEAM"];
  const isBodysuit = ["BODYSUIT", "BODY_SUIT", "SWIMSUIT", "ONE_PIECE_SWIM", "LEOTARD"].some((token) => value.includes(token));
  if (isBodysuit) return ["LENGTH", "CHEST_WIDTH", "WAIST", "HIP"];
  return isDress ? [...upperBody, "WAIST", "HIP"] : upperBody;
}
