import { ProductBatchDetailPage } from "../../product-batch-workbench-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductBatchDetailPage batchId={id} />;
}
