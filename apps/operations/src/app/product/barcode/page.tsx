import { ProductQueuePage } from "../product-center-client";
import { ProductBatchBarcodePage } from "../product-batch-barcode-client";

export default async function BarcodePage({ searchParams }: { searchParams: Promise<{ batchId?: string }> }) {
  const { batchId } = await searchParams;
  if (batchId) return <ProductBatchBarcodePage batchId={batchId} />;
  return (
    <ProductQueuePage
      queue="barcode"
      title="Barcode"
      description="校准完成后批量生成正式 Barcode，打印、贴码，再扫码入库。"
    />
  );
}
