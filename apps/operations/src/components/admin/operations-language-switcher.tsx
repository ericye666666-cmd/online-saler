"use client";

import { LanguagesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OPERATIONS_LOCALE_LABELS, OPERATIONS_LOCALE_SHORT_LABELS } from "@/i18n/locale";
import { useOperationsI18n } from "@/i18n/provider";

export function OperationsLanguageSwitcher() {
  const { locale, setLocale } = useOperationsI18n();
  const nextLocale = locale === "en" ? "zh-CN" : "en";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-9 gap-1.5 px-2"
      onClick={() => setLocale(nextLocale)}
      title={OPERATIONS_LOCALE_LABELS[nextLocale]}
      aria-label={OPERATIONS_LOCALE_LABELS[nextLocale]}
    >
      <LanguagesIcon data-icon="inline-start" />
      <span className="text-xs font-medium">{OPERATIONS_LOCALE_SHORT_LABELS[nextLocale]}</span>
    </Button>
  );
}
