import { ProductDetailReviewPage } from "../../product-detail-generation-client";

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  return <ProductDetailReviewPage profileId={id} initialMode={mode === "edit" ? "edit" : "preview"} />;
}
