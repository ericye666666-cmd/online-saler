import { BadRequestException } from "@nestjs/common";

export const RETURN_REASONS = ["WRONG_ITEM", "PHOTO_MISMATCH", "UNDISCLOSED_DEFECT", "MEASUREMENT_DIFFERENCE", "DELIVERY_DAMAGE"] as const;
export const ACTIVE_RETURN_STATUSES = ["REQUESTED", "APPROVED", "RECEIVED"] as const;

export function requiredText(value: unknown, label: string, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}

export function assertReturnWindow(completedAt: Date | null | undefined, now: Date) {
  if (!completedAt || now.getTime() < completedAt.getTime() || now.getTime() - completedAt.getTime() > 24 * 60 * 60 * 1000) {
    throw new BadRequestException("Return requests must be received within 24 hours after completed delivery or pickup.");
  }
}

export function assertRefundAmount(amount: unknown, lineTotal: number, itemRefunded: number, orderTotal: number, orderRefunded: number, successfulPayment: number): asserts amount is number {
  if (!Number.isSafeInteger(amount) || (amount as number) <= 0) throw new BadRequestException("Refund amount must be a positive integer KSh amount.");
  if ((amount as number) + itemRefunded > lineTotal || (amount as number) + orderRefunded > Math.min(orderTotal, successfulPayment)) {
    throw new BadRequestException("Recorded refunds would exceed the original paid item/order amount.");
  }
}

/** Largest remainder allocation preserves the original integer order commission exactly. */
export function commissionShares(items: readonly { id: string; lineTotalKsh: number }[], originalAmount: number): Map<string, number> {
  const total = items.reduce((sum, item) => sum + item.lineTotalKsh, 0);
  if (!Number.isSafeInteger(originalAmount) || originalAmount < 0 || total <= 0) throw new BadRequestException("Original commission allocation is inconsistent; finance review is required.");
  const rows = items.map((item) => ({ id: item.id, amount: Math.floor(originalAmount * item.lineTotalKsh / total), remainder: (originalAmount * item.lineTotalKsh) % total }));
  let remaining = originalAmount - rows.reduce((sum, row) => sum + row.amount, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (const row of rows) if (remaining > 0) { row.amount += 1; remaining -= 1; }
  return new Map(rows.map((row) => [row.id, row.amount]));
}
