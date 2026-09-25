import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { BrowseSectionRail } from "../components/browse-section-rail";
import { SectionIcon } from "../components/section-icon";
import { listPublishedProducts } from "../../db/catalog";
import { getStorefrontI18n } from "../../i18n/server";
import { translateValue } from "../../i18n/dictionary";
import { cardImageSrc } from "../storefront-products";
import { browseHref, browseSections, isDepartment, isGroup, isSection, sectionOf, stockedMenu } from "../shop-taxonomy";

export const dynamic = "force-dynamic";

type BrowseProps = { searchParams: Promise<{ d?: string; s?: string; g?: string }> };

/**
 * Browse: Women / Men / Kids tabs, then a row of drawn sections — Tops,
 * Bottoms, Jackets & coats, Dresses & skirts, Shoes, Bags… — to swipe
 * through. The chosen section lays out its categories as photo tiles; a tile
 * opens the catalogue on that category. Only stocked sections and
 * categories are shown, so no tile leads to an empty page.
 */
export default async function CategoriesPage({ searchParams }: BrowseProps) {
  const [{ d, s, g }, products, { locale, t }] = await Promise.all([
    searchParams,
    listPublishedProducts(),
    getStorefrontI18n(),
  ]);
  const available = products.filter((product) => product.status === "Available");
  const menu = stockedMenu(available.map((product) => product.placements ?? []));
  const active = menu.find((entry) => entry.department === (isDepartment(d) ? d : null)) ?? menu[0];
  const sections = active ? browseSections(available, active.department) : [];
  // `?g=` is from before sections: Bags opens Bags, Clothing its first section.
  const wanted = isSection(s) ? s : isGroup(g) && g !== "Clothing" ? sectionOf(g, "") : null;
  const openSection = sections.find((entry) => entry.section === wanted)
    ?? (g === "Clothing" ? sections.find((entry) => !entry.group) : undefined)
    ?? sections[0];
  const department = active ? translateValue(locale, active.department) : "";
  const newest = available.find((product) => product.image);
  const sectionHref = (section: string) => `/categories?d=${encodeURIComponent(active?.department ?? "")}&s=${encodeURIComponent(section)}`;

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

        {active && openSection ? (
          <>
            <BrowseSectionRail label={department}>
              {sections.map((entry) => {
                const current = entry.section === openSection.section;
                return (
                  <Link
                    key={entry.section}
                    href={sectionHref(entry.section)}
                    className={current ? "active" : ""}
                    aria-current={current ? "true" : undefined}
                    scroll={false}
                  >
                    <span className="browseSectionIcon"><SectionIcon section={entry.section} /></span>
                    <span className="browseSectionLabel">{translateValue(locale, entry.section)}</span>
                  </Link>
                );
              })}
            </BrowseSectionRail>

            <div className="browseSectionHeading">
              <h1>{translateValue(locale, openSection.section)}</h1>
              {openSection.group ? (
                <Link href={browseHref({ department: active.department, group: openSection.group })}>
                  {t("browse.seeAll")}
                </Link>
              ) : null}
            </div>

            <ul className="browseTiles">
              {openSection.categories.map((entry) => (
                <li key={`${entry.group}-${entry.category}`}>
                  <Link href={browseHref({ department: active.department, group: entry.group, shopCategory: entry.category })}>
                    <span className="browseTileFrame">
                      {entry.image ? <img src={cardImageSrc(entry.image)} alt="" loading="lazy" /> : null}
                    </span>
                    <span className="browseTileLabel">{translateValue(locale, entry.category)}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <ul className="browseList browseDepartmentAll">
              <li>
                <Link href={browseHref({ department: active.department })}>
                  <span>{t("browse.departmentHome", { department })}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
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
