"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { translate, type StorefrontLocale } from "./dictionary";

type StorefrontI18nValue = {
  locale: StorefrontLocale;
  t: (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => string;
};

const StorefrontI18nContext = createContext<StorefrontI18nValue>({
  locale: "en",
  t: (key, values) => translate("en", key, values),
});

export function StorefrontI18nProvider({ locale, children }: { locale: StorefrontLocale; children: ReactNode }) {
  const value = useMemo<StorefrontI18nValue>(() => ({
    locale,
    t: (key, values) => translate(locale, key, values),
  }), [locale]);

  return <StorefrontI18nContext.Provider value={value}>{children}</StorefrontI18nContext.Provider>;
}

export function useStorefrontI18nContext() {
  return useContext(StorefrontI18nContext);
}
