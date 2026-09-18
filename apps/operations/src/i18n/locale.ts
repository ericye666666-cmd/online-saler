export const operationsLocales = ["zh-CN", "en"] as const;

export type OperationsLocale = (typeof operationsLocales)[number];

export const DEFAULT_OPERATIONS_LOCALE: OperationsLocale = "zh-CN";

export const OPERATIONS_LOCALE_COOKIE = "operations-locale";

export const OPERATIONS_LOCALE_LABELS: Record<OperationsLocale, string> = {
  "zh-CN": "简体中文",
  en: "English"
};

export const OPERATIONS_LOCALE_SHORT_LABELS: Record<OperationsLocale, string> = {
  "zh-CN": "中文",
  en: "EN"
};

export function normalizeOperationsLocale(value?: string | null): OperationsLocale {
  return operationsLocales.includes(value as OperationsLocale) ? (value as OperationsLocale) : DEFAULT_OPERATIONS_LOCALE;
}
