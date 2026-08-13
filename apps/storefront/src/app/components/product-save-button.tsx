"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";

export function ProductSaveButton({ productTitle }: { productTitle: string }) {
  const [saved, setSaved] = useState(false);
  const { t } = useStorefrontI18n();

  return (
    <button
      className={`productDetailSave ${saved ? "saved" : ""}`}
      type="button"
      onClick={() => setSaved((current) => !current)}
      aria-label={saved ? t("catalog.removeSaved", { item: productTitle }) : t("catalog.saveItem", { item: productTitle })}
      aria-pressed={saved}
    >
      <Heart size={30} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
