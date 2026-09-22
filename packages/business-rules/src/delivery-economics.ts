/**
 * Delivery economics. The customer pays a flat KSh 50 delivery fee; the node
 * pays whatever Bolt actually charges. Those two numbers are never the same,
 * so every delivered order records both and the difference is the subsidy the
 * company absorbed.
 */

export type DeliveryEconomicsInput = {
  customerDeliveryFeeKsh: number;
  actualDeliveryCostKsh: number | null;
};

export type DeliveryEconomics = {
  customerDeliveryFeeKsh: number;
  actualDeliveryCostKsh: number | null;
  subsidyKsh: number | null;
};

export const MAX_ACTUAL_DELIVERY_COST_KSH = 20_000;

export function isValidActualDeliveryCost(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= MAX_ACTUAL_DELIVERY_COST_KSH;
}

/** Positive subsidy means the company paid more than the customer did. */
export function deliverySubsidyKsh(input: DeliveryEconomicsInput): number | null {
  if (input.actualDeliveryCostKsh === null) return null;
  return input.actualDeliveryCostKsh - input.customerDeliveryFeeKsh;
}

export function deliveryEconomics(input: DeliveryEconomicsInput): DeliveryEconomics {
  return {
    customerDeliveryFeeKsh: input.customerDeliveryFeeKsh,
    actualDeliveryCostKsh: input.actualDeliveryCostKsh,
    subsidyKsh: deliverySubsidyKsh(input)
  };
}

export function summariseDeliveryEconomics(rows: readonly DeliveryEconomicsInput[]) {
  let deliveryRevenueKsh = 0;
  let actualDeliveryCostKsh = 0;
  let ordersWithRecordedCost = 0;
  let ordersMissingCost = 0;
  for (const row of rows) {
    deliveryRevenueKsh += row.customerDeliveryFeeKsh;
    if (row.actualDeliveryCostKsh === null) {
      ordersMissingCost += 1;
      continue;
    }
    actualDeliveryCostKsh += row.actualDeliveryCostKsh;
    ordersWithRecordedCost += 1;
  }
  return {
    deliveryRevenueKsh,
    actualDeliveryCostKsh,
    subsidyKsh: actualDeliveryCostKsh - deliveryRevenueKsh,
    ordersWithRecordedCost,
    ordersMissingCost,
    averageCostPerOrderKsh: ordersWithRecordedCost
      ? Math.round(actualDeliveryCostKsh / ordersWithRecordedCost)
      : null
  };
}
