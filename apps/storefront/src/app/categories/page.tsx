import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { listPublishedProducts } from "../../db/catalog";
import { getStorefrontI18n } from "../../i18n/server";
import { translateValue } from "../../i18n/dictionary";
import { browseHref, isDepartment, stockedMenu } from "../shop-taxonomy";

export const dynamic = "force-dynamic";

type BrowseProps = { searchParams: Promise<{ d?: string }> };

/**
 * Department tabs across the top, that department's categories below — the
 * Vestiaire app's Browse screen. Only departments and categories with
 * something available are listed, so no row leads to an empty page.
 */
export default async function CategoriesPage({ searchParams }: BrowseProps) {
  const [{ d }, products, { locale, t }] = await Promise.all([
    searchParams,
    listPublishedProducts(),
    getStorefrontI18n(),
  ]);
  const available = products.filter((product) => product.status === "Available");
  const menu = stockedMenu(available.map((product) => product.placements ?? []));
  const active = menu.find((entry) => entry.department === (isDepartment(d) ? d : null)) ?? menu[0];

  return (
    <main className="browsePage">
      <SiteHeader />

      <div className="browseShell">
        <h1>{t("browse.title")}</h1>
        <p className="browseIntro">{t("browse.intro", { count: String(available.length) })}</p>

        <nav className="browseDepartments" aria-label={t("browse.title")}>
          {menu.map((entry) => (
            <Link
              key={entry.department}
              href={`/categories?d=${encodeURIComponent(entry.department)}`}
              className={entry.department === active?.department ? "active" : ""}
              aria-current={entry.department === active?.department ? "page" : undefined}
            >
              {translateValue(locale, entry.department)}
            </Link>
          ))}
        </nav>

        {active ? (
          <>
            <Link className="browseAllRow" href={browseHref({ department: active.department })}>
              <span>{t("header.seeAllIn", { department: translateValue(locale, active.department) })}</span>
              <span className="browseCount">{active.total}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>

            <ul className="browseList">
              {active.categories.map((entry) => (
                <li key={entry.category}>
                  <Link href={browseHref({ department: active.department, shopCategory: entry.category })}>
                    <span>{translateValue(locale, entry.category)}</span>
                    <span className="browseCount">{entry.count}</span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </main>
  );
}
