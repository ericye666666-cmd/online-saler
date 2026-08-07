import { ProductBatchUploadPage } from "../../../product-batch-execution-client";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ productId?: string }> }) {
  const { id } = await params;
  const { productId } = await searchParams;
  return <ProductBatchUploadPage batchId={id} initialProductId={productId} />;
}
