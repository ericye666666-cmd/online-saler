"use client";

import { Languages } from "lucide-react";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useStorefrontI18n();
  const nextLocale = locale === "en" ? "zh-CN" : "en";

  return (
    <a
      className={`languageSwitcher ${compact ? "compact" : ""}`}
      href={`/api/locale?locale=${encodeURIComponent(nextLocale)}`}
      aria-label={`${t("header.language")}: ${nextLocale === "en" ? t("language.english") : t("language.chinese")}`}
    >
      <Languages size={compact ? 19 : 18} />
      <span>{nextLocale === "en" ? "EN" : "中文"}</span>
    </a>
  );
}
