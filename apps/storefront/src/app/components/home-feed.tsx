import Link from "next/link";
import { Product } from "../data/products";
import { getStorefrontI18n } from "../../i18n/server";
import { translateValue } from "../../i18n/dictionary";
import { HomeSizePicks } from "./home-size-picks";
import { RailCard } from "./rail-card";

const RAIL_LENGTH = 12;

export async function HomeFeed({ products }: { products: Product[] }) {
  const { locale, t } = await getStorefrontI18n();
  const available = products.filter((product) => product.status === "Available");

  // One tile per stocked category, illustrated by the first item in it.
  const categoryTiles: { category: string; image: string; count: number }[] = [];
  for (const product of available) {
    const existing = categoryTiles.find((tile) => tile.category === product.category);
    if (existing) existing.count += 1;
    else categoryTiles.push({ category: product.category, image: product.image, count: 1 });
  }

  const newest = available.slice(0, RAIL_LENGTH);

  return (
    <div className="homeFeed">
      <p className="homeDropStrip">
        {t("home.dropStrip", { count: String(available.length) })}
      </p>

      {categoryTiles.length > 1 ? (
        <section className="homeFeedSection">
          <div className="homeFeedHeading">
            <h2>{t("home.shopByCategory")}</h2>
            <Link href="/categories">{t("home.seeAll")}</Link>
          </div>
          <div className="homeRail homeCategoryRail">
            {categoryTiles.map((tile) => (
              <Link className="homeCategoryTile" key={tile.category} href={`/?category=${encodeURIComponent(tile.category)}`}>
                {tile.image ? <img src={tile.image} alt="" loading="lazy" /> : <span className="homeRailNoImage" />}
                <span>{translateValue(locale, tile.category)}</span>
                <small>{tile.count}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {newest.length > 0 ? (
        <section className="homeFeedSection">
          <div className="homeFeedHeading">
            <h2>{t("home.newIn")}</h2>
          </div>
          <div className="homeRail">
            {newest.map((product) => <RailCard key={product.code} product={product} locale={locale} />)}
          </div>
        </section>
      ) : null}

      <HomeSizePicks products={available} locale={locale} />
    </div>
  );
}
