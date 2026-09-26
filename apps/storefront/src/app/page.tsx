import { CatalogApp } from "./components/catalog-app";
import { HomeFeed } from "./components/home-feed";
import { ReferralTracker } from "./components/referral-tracker";
import { SiteHeader } from "./components/site-header";
import { normalizeSellerRef, normalizeTrackingParam } from "./data/products";
import { departmentCategories, isDepartment, isGroup, onChosenShelf } from "./shop-taxonomy";
import { listPublishedProducts } from "../db/catalog";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{
    ref?: string; category?: string; group?: string; type?: string; q?: string; view?: string; size?: string;
    source?: string; placement?: string; campaign?: string; utm_source?: string; utm_campaign?: string;
  }>;
};

/**
 * Two pages share this route. With nothing chosen it is the home page:
 * category tiles, New in today and the size picks — as on Vestiaire, the
 * full catalogue is not laid out here. Choosing a department, group or
 * category, searching (?q=) or asking for everything (?view=all) opens the
 * catalogue grid, which renders a page of cards at a time.
 */
export default async function Home({ searchParams }: HomeProps) {
  const [query, products] = await Promise.all([searchParams, listPublishedProducts()]);
  const sellerRef = normalizeSellerRef(query.ref);
  const source = normalizeTrackingParam(query.source ?? query.utm_source);
  const placement = normalizeTrackingParam(query.placement);
  const campaign = normalizeTrackingParam(query.campaign ?? query.utm_campaign);

  // `category` is the department. Links from before departments ("Bags",
  // "Shoes", "Home Textiles") land on the matching group instead.
  const legacyGroup = query.category === "Home Textiles" ? "Home" : query.category;
  const department = isDepartment(query.category) ? query.category : "All";
  const group = isGroup(query.group) ? query.group : department === "All" && isGroup(legacyGroup) ? legacyGroup : "All";
  const shopCategory = group !== "All" && query.type
    && (department === "All"
      ? Object.values(departmentCategories).some((shelves) => shelves[group].includes(query.type!))
      : departmentCategories[department][group].includes(query.type))
    ? query.type : "All";
  const search = query.q?.trim() ?? "";
  const size = query.size?.trim().slice(0, 40) || "All";
  const browsing = department !== "All" || group !== "All" || Boolean(search) || query.view === "all";

  if (!browsing) {
    return (
      <main className="catalogPage depopCatalogPage">
        <ReferralTracker sellerRef={sellerRef} source={source} placement={placement} campaign={campaign} />
        <SiteHeader sellerRef={sellerRef} />
        <HomeFeed products={products} sellerRef={sellerRef} />
      </main>
    );
  }

  // A department page only needs that department's pieces; searches and
  // "everything" get the whole list.
  const inScope = department === "All" || search ? products : products.filter((product) => onChosenShelf(product.placements, department));

  return (
    <CatalogApp
      initialProducts={inScope}
      initialDepartment={department}
      initialGroup={group}
      initialShopCategory={shopCategory}
      initialQuery={search}
      initialSize={size}
      scopedDepartment={department === "All" || search ? undefined : department}
      sellerRef={sellerRef}
      source={source}
      placement={placement}
      campaign={campaign}
    />
  );
}
