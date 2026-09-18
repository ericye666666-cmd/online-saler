import Link from "next/link";
import { Product } from "../data/products";
import { getStorefrontI18n } from "../../i18n/server";
import { translateValue } from "../../i18n/dictionary";
import { HomeSizePicks } from "./home-size-picks";
import { RailCard } from "./rail-card";
import { cardImageSrc } from "../storefront-products";
import { departments, type Department } from "../shop-taxonomy";

const RAIL_LENGTH = 12;

export async function HomeFeed({ products }: { products: Product[] }) {
  const { locale, t } = await getStorefrontI18n();
  const available = products.filter((product) => product.status === "Available");

  // One tile per stocked department, each illustrated by a different item so
  // unisex pieces shelved in both Women and Men do not repeat.
  const categoryTiles: { department: Department; image: string }[] = [];
  const used = new Set<string>();
  for (const department of departments) {
    const candidates = available.filter((product) => !used.has(product.code) && product.image
      && product.placements?.some((placement) => placement.department === department));
    // A women's-only piece says "Women" better than a unisex one.
    const cover = candidates.find((product) => product.placements?.length === 1) ?? candidates[0];
    if (!cover) continue;
    used.add(cover.code);
    categoryTiles.push({ department, image: cover.image });
  }

  const newest = available.slice(0, RAIL_LENGTH);

  return (
    <div className="homeFeed">
      {categoryTiles.length > 1 ? (
        <section className="homeFeedSection">
          <div className="homeFeedHeading">
            <h2>{t("home.shopByCategory")}</h2>
          </div>
          <div className="homeRail homeCategoryRail">
            {categoryTiles.map((tile) => (
              <Link className="homeCategoryTile" key={tile.department} href={`/?category=${encodeURIComponent(tile.department)}`}>
                <span className="homeCategoryFrame">
                  {tile.image ? <img src={cardImageSrc(tile.image)} alt="" loading="lazy" /> : null}
                </span>
                <span className="homeCategoryLabel">{translateValue(locale, tile.department)}</span>
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
          <div className="homeRail homeProductRail">
            {newest.map((product) => <RailCard key={product.code} product={product} locale={locale} />)}
          </div>
          <a className="homeSeeAllButton" href="#catalog">{t("home.seeAll")}</a>
        </section>
      ) : null}

      <HomeSizePicks products={available} locale={locale} />
    </div>
  );
}
