import { ProductDetailReviewPage } from "../../product-detail-generation-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetailReviewPage profileId={id} />;
}
