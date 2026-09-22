import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { listPublishedProducts } from "../../db/catalog";
import { getStorefrontI18n } from "../../i18n/server";
import { translateValue } from "../../i18n/dictionary";
import { cardImageSrc } from "../storefront-products";
import { browseHref, isDepartment, isGroup, stockedMenu } from "../shop-taxonomy";

export const dynamic = "force-dynamic";

type BrowseProps = { searchParams: Promise<{ d?: string; g?: string }> };

/**
 * Vestiaire's Browse screen: Women / Men / Kids tabs, then "Women home"
 * and one row per group — Bags, Clothing, Shoes… A group row opens its
 * categories. Only stocked rows are listed, so none leads to an empty page.
 */
export default async function CategoriesPage({ searchParams }: BrowseProps) {
  const [{ d, g }, products, { locale, t }] = await Promise.all([
    searchParams,
    listPublishedProducts(),
    getStorefrontI18n(),
  ]);
  const available = products.filter((product) => product.status === "Available");
  const menu = stockedMenu(available.map((product) => product.placements ?? []));
  const active = menu.find((entry) => entry.department === (isDepartment(d) ? d : null)) ?? menu[0];
  const openGroup = active && isGroup(g) ? active.groups.find((entry) => entry.group === g) ?? null : null;
  const department = active ? translateValue(locale, active.department) : "";
  const newest = available.find((product) => product.image);

  return (
    <main className="browsePage">
      <SiteHeader />

      <div className="browseShell">
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

        {active && openGroup ? (
          <>
            <Link className="browseBack" href={`/categories?d=${encodeURIComponent(active.department)}`}>
              <ChevronLeft size={18} aria-hidden="true" /> {t("browse.back")}
            </Link>
            <h1 className="browseGroupTitle">{department} · {translateValue(locale, openGroup.group)}</h1>
            <ul className="browseList">
              <li>
                <Link href={browseHref({ department: active.department, group: openGroup.group })}>
                  <span>{t("browse.allInGroup", { group: translateValue(locale, openGroup.group) })}</span>
                  <span className="browseCount">{openGroup.total}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
              {openGroup.categories.map((entry) => (
                <li key={entry.category}>
                  <Link href={browseHref({ department: active.department, group: openGroup.group, shopCategory: entry.category })}>
                    <span>{translateValue(locale, entry.category)}</span>
                    <span className="browseCount">{entry.count}</span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : active ? (
          <>
            <ul className="browseList">
              <li>
                <Link href={browseHref({ department: active.department })}>
                  <span>{t("browse.departmentHome", { department })}</span>
                  <span className="browseCount">{active.total}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
              {active.groups.map((entry) => (
                <li key={entry.group}>
                  <Link href={`/categories?d=${encodeURIComponent(active.department)}&g=${encodeURIComponent(entry.group)}`}>
                    <span>{translateValue(locale, entry.group)}</span>
                    <span className="browseCount">{entry.total}</span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>

            <Link className="browsePromo" href={browseHref({ department: "All" })}>
              <span>
                <strong>{t("browse.newIn")}</strong>
                <small>{t("browse.newInBody")}</small>
              </span>
              {newest ? <img src={cardImageSrc(newest.image)} alt="" loading="lazy" /> : <b>NEW</b>}
            </Link>
          </>
        ) : null}
      </div>
    </main>
  );
}
