import { CatalogApp } from "./components/catalog-app";
import { categories, normalizeSellerRef, normalizeTrackingParam } from "./data/products";
import { listPublishedProducts } from "../db/catalog";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{ ref?: string; category?: string; source?: string; placement?: string; campaign?: string; utm_source?: string; utm_campaign?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const [query, products] = await Promise.all([
    searchParams,
    listPublishedProducts(),
  ]);
  const { ref, category } = query;
  const initialCategory = categories.includes(
    category as (typeof categories)[number],
  )
    ? (category as (typeof categories)[number])
    : "All";

  const sellerRef = normalizeSellerRef(ref);
  const source = normalizeTrackingParam(query.source ?? query.utm_source);
  const placement = normalizeTrackingParam(query.placement);
  const campaign = normalizeTrackingParam(query.campaign ?? query.utm_campaign);

  return (
    <CatalogApp
      initialProducts={products}
      initialCategory={initialCategory}
      sellerRef={sellerRef}
      source={source}
      placement={placement}
      campaign={campaign}
    />
  );
}
