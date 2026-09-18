import { CatalogApp } from "./components/catalog-app";
import { HomeFeed } from "./components/home-feed";
import { normalizeSellerRef, normalizeTrackingParam } from "./data/products";
import { departmentCategories, isDepartment } from "./shop-taxonomy";
import { listPublishedProducts } from "../db/catalog";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{ ref?: string; category?: string; type?: string; source?: string; placement?: string; campaign?: string; utm_source?: string; utm_campaign?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const [query, products] = await Promise.all([
    searchParams,
    listPublishedProducts(),
  ]);
  const { ref, category, type } = query;
  // `category` is the department; links from before departments existed
  // ("Home Textiles") still land somewhere sensible.
  const legacy = category === "Home Textiles" ? "Home" : category;
  const initialDepartment = isDepartment(legacy) ? legacy : "All";
  const initialShopCategory = initialDepartment !== "All" && type && departmentCategories[initialDepartment].includes(type) ? type : "All";

  const sellerRef = normalizeSellerRef(ref);
  const source = normalizeTrackingParam(query.source ?? query.utm_source);
  const placement = normalizeTrackingParam(query.placement);
  const campaign = normalizeTrackingParam(query.campaign ?? query.utm_campaign);

  return (
    <CatalogApp
      initialProducts={products}
      initialDepartment={initialDepartment}
      initialShopCategory={initialShopCategory}
      sellerRef={sellerRef}
      source={source}
      placement={placement}
      campaign={campaign}
      feed={<HomeFeed products={products} />}
    />
  );
}
