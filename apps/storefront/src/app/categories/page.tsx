import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { categories } from "../data/products";
import { listPublishedProducts } from "../../db/catalog";
import { getStorefrontI18n } from "../../i18n/server";
import { translateValue } from "../../i18n/dictionary";

export const dynamic = "force-dynamic";

// Every category the catalog can hold, in the order shoppers think about them.
const browseOrder = categories.filter((category) => category !== "All");

export default async function CategoriesPage() {
  const [products, { locale, t }] = await Promise.all([
    listPublishedProducts(),
    getStorefrontI18n(),
  ]);

  const counts = new Map<string, number>();
  for (const product of products) {
    counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
  }
  // A category with nothing in it is a dead end, so it stays off the list.
  const stocked = browseOrder.filter((category) => (counts.get(category) ?? 0) > 0);

  return (
    <main className="browsePage">
      <SiteHeader />

      <div className="browseShell">
        <h1>{t("browse.title")}</h1>
        <p className="browseIntro">{t("browse.intro", { count: String(products.length) })}</p>

        <Link className="browseAllRow" href="/">
          <span>{t("browse.everything")}</span>
          <span className="browseCount">{products.length}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>

        <ul className="browseList">
          {stocked.map((category) => (
            <li key={category}>
              <Link href={`/?category=${encodeURIComponent(category)}`}>
                <span>{translateValue(locale, category)}</span>
                <span className="browseCount">{counts.get(category)}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
