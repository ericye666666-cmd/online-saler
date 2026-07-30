import { CatalogApp } from "./components/catalog-app";
import { categories, normalizeSellerRef } from "./data/products";
import { listPublishedProducts } from "../db/catalog";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{ ref?: string; category?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const [{ ref, category }, products] = await Promise.all([
    searchParams,
    listPublishedProducts(),
  ]);
  const initialCategory = categories.includes(
    category as (typeof categories)[number],
  )
    ? (category as (typeof categories)[number])
    : "All";

  return (
    <CatalogApp
      initialProducts={products}
      initialCategory={initialCategory}
      sellerRef={normalizeSellerRef(ref)}
    />
  );
}
