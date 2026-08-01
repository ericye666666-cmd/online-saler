import { requiredProductMeasurementTypes } from "@online-saler/business-rules";

type PublishMeasurementInput = {
  category?: string | null;
  subcategory?: string | null;
  sleeveType?: string | null;
  measurements: Array<{
    measurementType: string;
    finalValueCm?: unknown;
  }>;
};

export function missingPublishMeasurementTypes(product: PublishMeasurementInput): string[] {
  const available = new Set(
    product.measurements
      .filter((measurement) => {
        const value = Number(measurement.finalValueCm);
        return Number.isFinite(value) && value > 0;
      })
      .map((measurement) => measurement.measurementType)
  );

  return requiredProductMeasurementTypes(product).filter((type) => !available.has(type));
}
