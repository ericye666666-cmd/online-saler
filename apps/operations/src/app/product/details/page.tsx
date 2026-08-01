import { ProductDetailGenerationPage } from "../product-detail-generation-client";

export default async function Page({ searchParams }: { searchParams: Promise<{ batchId?: string }> }) {
  const { batchId } = await searchParams;
  return <ProductDetailGenerationPage batchId={batchId} />;
}
