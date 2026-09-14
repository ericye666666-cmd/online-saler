import { redirect } from "next/navigation";
import { ProductBatchBarcodePage } from "../product-batch-barcode-client";

export default async function DisplayReviewPage({ searchParams }: { searchParams: Promise<{ batchId?: string }> }) {
  const { batchId } = await searchParams;
  if (!batchId) redirect("/product/details");
  return <ProductBatchBarcodePage batchId={batchId} reviewMode />;
}
