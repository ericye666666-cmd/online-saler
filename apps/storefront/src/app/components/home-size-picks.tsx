"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Product } from "../data/products";
import { readSizePreference, subscribeToSizePreference, writeSizePreference } from "../size-preference";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";
import type { StorefrontLocale } from "../../i18n/dictionary";
import { RailCard } from "./rail-card";

const RAIL_LENGTH = 12;
const MAX_CHOICES = 12;

export function HomeSizePicks({ products, locale }: { products: Product[]; locale: StorefrontLocale }) {
  const { t } = useStorefrontI18n();
  const [size, setSize] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const sync = () => {
      setSize(readSizePreference());
      setChecked(true);
    };
    sync();
    return subscribeToSizePreference(sync);
  }, []);

  // Only offer sizes that something in stock actually carries — a size with no
  // items behind it is a promise the shelf cannot keep.
  const choices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      const value = product.size?.trim();
      if (!value || value === "Size not confirmed") continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, MAX_CHOICES)
      .map(([value]) => value);
  }, [products]);

  const matches = useMemo(
    () => (size ? products.filter((product) => product.size?.trim() === size).slice(0, RAIL_LENGTH) : []),
    [products, size],
  );

  if (!checked || choices.length === 0) return null;

  if (!size) {
    return (
      <section className="homeFeedSection homeSizeAsk">
        <div className="homeFeedHeading">
          <h2>{t("home.sizeAsk")}</h2>
        </div>
        <p className="homeSizeAskHint">{t("home.sizeAskHint")}</p>
        <div className="homeSizeChoices">
          {choices.map((choice) => (
            <button key={choice} type="button" onClick={() => writeSizePreference(choice)}>{choice}</button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="homeFeedSection">
      <div className="homeFeedHeading">
        <h2>{t("home.sizePicks", { size })}</h2>
        <button className="homeSizeChange" type="button" onClick={() => writeSizePreference(null)}>
          {t("home.sizeChange")}
        </button>
      </div>
      {matches.length > 0 ? (
        <div className="homeRail homeProductRail">
          {matches.map((product) => <RailCard key={product.code} product={product} locale={locale} />)}
        </div>
      ) : (
        <p className="homeSizeEmpty">
          {t("home.sizeNone", { size })} <Link href="/categories">{t("home.seeAll")}</Link>
        </p>
      )}
    </section>
  );
}
