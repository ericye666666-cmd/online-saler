const NAIROBI_UTC_OFFSET_MINUTES = 180;
const DAILY_SEQUENCE_LENGTH = 5;
const MAX_DAILY_SEQUENCE = 99_999;

export type BarcodeBusinessDate = {
  year: number;
  dayOfYear: number;
};

export function barcodeBusinessDate(now: Date): BarcodeBusinessDate {
  const nairobiTime = new Date(now.getTime() + NAIROBI_UTC_OFFSET_MINUTES * 60_000);
  const year = nairobiTime.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const startOfDay = Date.UTC(year, nairobiTime.getUTCMonth(), nairobiTime.getUTCDate());

  return {
    year,
    dayOfYear: Math.floor((startOfDay - startOfYear) / 86_400_000) + 1
  };
}

export function barcodePrefix(date: BarcodeBusinessDate): string {
  const year = String(date.year % 100).padStart(2, "0");
  const dayOfYear = String(date.dayOfYear).padStart(3, "0");
  return `9${year}${dayOfYear}`;
}

export function buildDailyBarcode(date: BarcodeBusinessDate, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_DAILY_SEQUENCE) {
    throw new Error(`Daily barcode sequence must be between 1 and ${MAX_DAILY_SEQUENCE}.`);
  }
  return `${barcodePrefix(date)}${String(sequence).padStart(DAILY_SEQUENCE_LENGTH, "0")}`;
}

export function nextDailyBarcode(date: BarcodeBusinessDate, existingBarcodes: readonly (string | null)[]): string {
  const prefix = barcodePrefix(date);
  const pattern = new RegExp(`^${prefix}(\\d{${DAILY_SEQUENCE_LENGTH}})$`);
  const highestSequence = existingBarcodes.reduce((highest, barcode) => {
    const match = barcode?.match(pattern);
    if (!match) return highest;
    return Math.max(highest, Number(match[1]));
  }, 0);

  return buildDailyBarcode(date, highestSequence + 1);
}

export function isElevenDigitProductBarcode(value: string): boolean {
  return /^9\d{10}$/.test(value);
}
