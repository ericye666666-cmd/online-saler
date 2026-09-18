"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { translate, type TranslationValues } from "./dictionary";
import {
  DEFAULT_OPERATIONS_LOCALE,
  OPERATIONS_LOCALE_COOKIE,
  normalizeOperationsLocale,
  type OperationsLocale
} from "./locale";
import { setOperationsRuntimeLocale } from "./runtime";

type OperationsI18nValue = {
  locale: OperationsLocale;
  setLocale: (locale: OperationsLocale) => void;
  t: (source: string, values?: TranslationValues) => string;
};

const OperationsI18nContext = createContext<OperationsI18nValue>({
  locale: DEFAULT_OPERATIONS_LOCALE,
  setLocale: () => undefined,
  t: (source, values) => translate(DEFAULT_OPERATIONS_LOCALE, source, values)
});

function persistLocale(locale: OperationsLocale): void {
  const oneYear = 60 * 60 * 24 * 365;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${OPERATIONS_LOCALE_COOKIE}=${locale}; path=/; max-age=${oneYear}; samesite=lax${secure}`;
}

export function OperationsI18nProvider({
  initialLocale = DEFAULT_OPERATIONS_LOCALE,
  children
}: {
  initialLocale?: OperationsLocale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<OperationsLocale>(() => normalizeOperationsLocale(initialLocale));

  // Applied during render so helper modules calling the module-level `t` agree with this render.
  setOperationsRuntimeLocale(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: OperationsLocale) => {
    const normalized = normalizeOperationsLocale(next);
    setOperationsRuntimeLocale(normalized);
    persistLocale(normalized);
    setLocaleState(normalized);
  }, []);

  const value = useMemo<OperationsI18nValue>(
    () => ({ locale, setLocale, t: (source, values) => translate(locale, source, values) }),
    [locale, setLocale]
  );

  return (
    <OperationsI18nContext.Provider value={value}>
      {/* Remounting on switch guarantees memoised subtrees pick up the new locale. */}
      <div key={locale} className="contents">
        {children}
      </div>
    </OperationsI18nContext.Provider>
  );
}

export function useOperationsI18n(): OperationsI18nValue {
  return useContext(OperationsI18nContext);
}
