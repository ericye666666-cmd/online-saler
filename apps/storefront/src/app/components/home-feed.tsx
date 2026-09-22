import Link from "next/link";
import { Product } from "../data/products";
import { getStorefrontI18n } from "../../i18n/server";
import { translateValue } from "../../i18n/dictionary";
import { HomeSizePicks } from "./home-size-picks";
import { RailCard } from "./rail-card";
import { cardImageSrc } from "../storefront-products";
import { browseHref, groups, type Group } from "../shop-taxonomy";

const RAIL_LENGTH = 12;

/**
 * The home page, as Vestiaire's: category tiles, New in today and, once a
 * shopper has said their size, pieces in it. The full catalogue is one tap
 * away (See all) rather than laid out here, so the page stays light however
 * many pieces are live.
 */
export async function HomeFeed({ products, sellerRef }: { products: Product[]; sellerRef?: string }) {
  const { locale, t } = await getStorefrontI18n();
  const available = products.filter((product) => product.status === "Available");

  // One tile per stocked group — Bags, Clothing, Shoes… — each illustrated by
  // a different piece.
  const categoryTiles: { group: Group; image: string }[] = [];
  const used = new Set<string>();
  for (const group of groups) {
    const cover = available.find((product) => !used.has(product.code) && product.image
      && product.placements?.some((placement) => placement.group === group));
    if (!cover) continue;
    used.add(cover.code);
    categoryTiles.push({ group, image: cover.image });
  }

  const newest = available.slice(0, RAIL_LENGTH);
  const allHref = browseHref({ department: "All" }, sellerRef);

  return (
    <div className="homeFeed">
      {categoryTiles.length ? (
        <section className="homeFeedSection">
          <div className="homeFeedHeading">
            <h2>{t("home.shopByCategory")}</h2>
          </div>
          <div className="homeRail homeCategoryRail">
            {categoryTiles.map((tile) => (
              <Link className="homeCategoryTile" key={tile.group} href={browseHref({ department: "All", group: tile.group }, sellerRef)}>
                <span className="homeCategoryFrame">
                  {tile.image ? <img src={cardImageSrc(tile.image)} alt="" loading="lazy" /> : null}
                </span>
                <span className="homeCategoryLabel">{translateValue(locale, tile.group)}</span>
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
          <Link className="homeSeeAllButton" href={allHref}>{t("home.seeAll")}</Link>
        </section>
      ) : null}

      <HomeSizePicks products={sizePickCandidates(available)} locale={locale} />
    </div>
  );
}

/**
 * The size rail runs in the browser (the shopper's size lives there), so it
 * gets only what a rail card shows: at most one rail's worth per size, and
 * no product-page detail.
 */
function sizePickCandidates(products: Product[]): Product[] {
  const perSize = new Map<string, number>();
  const picks: Product[] = [];
  for (const product of products) {
    const taken = perSize.get(product.size) ?? 0;
    if (taken >= RAIL_LENGTH) continue;
    perSize.set(product.size, taken + 1);
    picks.push({ ...product, detail: undefined, description: "" });
  }
  return picks;
}
