import { translate, type TranslationValues } from "./dictionary";
import { DEFAULT_OPERATIONS_LOCALE, type OperationsLocale } from "./locale";

/**
 * Module-level locale so plain helper modules (status label maps, flow helpers) can translate
 * without threading a hook through every call site.
 *
 * Safe because the operations shell renders nothing translated on the server: it gates the whole
 * tree behind a client-only session restore and returns the loading screen during SSR. Any text
 * that IS server-rendered must use `useOperationsI18n()` instead of this `t`.
 */
let currentLocale: OperationsLocale = DEFAULT_OPERATIONS_LOCALE;

export function operationsLocale(): OperationsLocale {
  return currentLocale;
}

export function setOperationsRuntimeLocale(locale: OperationsLocale): void {
  currentLocale = locale;
}

export function t(source: string, values?: TranslationValues): string {
  return translate(currentLocale, source, values);
}

/**
 * Locale tag for Intl date and number formatting. Kenya writes dates day-first, so English
 * staff get en-GB rather than en-US.
 */
export function operationsFormatLocale(): string {
  return currentLocale === "en" ? "en-GB" : "zh-CN";
}
