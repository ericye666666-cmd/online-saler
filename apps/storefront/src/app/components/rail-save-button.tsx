"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";
import { isSaved as readIsSaved, subscribeToSaved, toggleSaved } from "../saved-items";

/** The heart beside a rail card's name. It sits outside the card's link, so a tap saves rather than navigates. */
export function RailSaveButton({ productCode, productTitle }: { productCode: string; productTitle: string }) {
  const [saved, setSaved] = useState(false);
  const { t } = useStorefrontI18n();

  useEffect(() => {
    const sync = () => setSaved(readIsSaved(productCode));
    sync();
    return subscribeToSaved(sync);
  }, [productCode]);

  return (
    <button
      className={`homeRailSave ${saved ? "saved" : ""}`}
      type="button"
      onClick={() => setSaved(toggleSaved(productCode))}
      aria-label={saved ? t("catalog.removeSaved", { item: productTitle }) : t("catalog.saveItem", { item: productTitle })}
      aria-pressed={saved}
    >
      <Heart size={20} strokeWidth={1.6} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
