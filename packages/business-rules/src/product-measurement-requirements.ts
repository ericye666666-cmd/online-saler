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
  | "LEG_OPENING";

const NON_APPAREL_CATEGORIES = new Set(["SHOES", "BAG", "OTHERS", "TEXTILE", "OTHER"]);

export function requiredProductMeasurementTypes(
  input: ProductMeasurementRequirementInput
): RequiredProductMeasurementType[] {
  const category = input.category?.trim().toUpperCase() ?? "";
  const subcategory = input.subcategory?.trim().toUpperCase() ?? "";
  const sleeveType = input.sleeveType?.trim().toUpperCase() ?? "";
  const isPants = category === "PANTS" || category === "SHORT" ||
    (category === "KIDS" && subcategory === "KIDS_PANTS");

  if (isPants) {
    return ["OUTSEAM", "WAIST", "HIP", "THIGH_WIDTH", "LEG_OPENING"];
  }

  if (NON_APPAREL_CATEGORIES.has(category)) return [];

  const upperBody: RequiredProductMeasurementType[] = ["LENGTH", "CHEST_WIDTH", "SHOULDER_WIDTH"];
  if (sleeveType !== "SLEEVELESS" && sleeveType !== "NOT_APPLICABLE") {
    upperBody.push("SLEEVE_LENGTH");
  }

  const isDress = category === "DRESSES" ||
    (category === "KIDS" && subcategory === "KIDS_DRESS");
  return isDress ? [...upperBody, "WAIST", "HIP"] : upperBody;
}
