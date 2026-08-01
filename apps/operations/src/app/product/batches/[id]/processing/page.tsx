import { ProductBatchProcessingPage } from "../../../product-batch-execution-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductBatchProcessingPage batchId={id} />;
}
