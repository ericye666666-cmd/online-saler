"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";
import { isSaved as readIsSaved, subscribeToSaved, toggleSaved } from "../saved-items";

export function ProductSaveButton({ productCode, productTitle }: { productCode: string; productTitle: string }) {
  const [saved, setSaved] = useState(false);
  const { t } = useStorefrontI18n();

  // Read after mount: the server render has no access to this browser's list,
  // and reading during render would mismatch the hydrated markup.
  useEffect(() => {
    const sync = () => setSaved(readIsSaved(productCode));
    sync();
    return subscribeToSaved(sync);
  }, [productCode]);

  return (
    <button
      className={`productDetailSave ${saved ? "saved" : ""}`}
      type="button"
      onClick={() => setSaved(toggleSaved(productCode))}
      aria-label={saved ? t("catalog.removeSaved", { item: productTitle }) : t("catalog.saveItem", { item: productTitle })}
      aria-pressed={saved}
    >
      <Heart size={30} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
