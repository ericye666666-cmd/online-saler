import { enDictionary } from "./en";
import { DEFAULT_OPERATIONS_LOCALE, type OperationsLocale } from "./locale";

/**
 * The operations workspace is written Chinese-first, so the Chinese copy itself is the
 * translation key. `zh-CN` therefore needs no dictionary, and any key that is missing from
 * `enDictionary` falls back to the Chinese source instead of rendering blank.
 */
export type TranslationValues = Record<string, string | number | null | undefined>;

const PLACEHOLDER = /\{(\w+)\}/g;

export function fillPlaceholders(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name] ?? "") : match
  );
}

export function translate(
  locale: OperationsLocale = DEFAULT_OPERATIONS_LOCALE,
  source: string,
  values?: TranslationValues
): string {
  if (!source) return source;
  const template = locale === "en" ? enDictionary[source] ?? source : source;
  return fillPlaceholders(template, values);
}

export function hasEnglishTranslation(source: string): boolean {
  return Object.prototype.hasOwnProperty.call(enDictionary, source);
}

export function placeholderNames(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}
