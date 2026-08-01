import { ProductQueuePage } from "../product-center-client";
import { ProductBatchCalibrationPage } from "../product-batch-calibration-client";

export default async function CalibrationPage({ searchParams }: { searchParams: Promise<{ batchId?: string }> }) {
  const { batchId } = await searchParams;
  if (batchId) return <ProductBatchCalibrationPage batchId={batchId} />;
  return (
    <ProductQueuePage
      queue="calibration"
      title="图片与信息校准"
      description="同页核对原图、抠图、商城主图与 AI 商品数据，确认尺寸、成色、瑕疵和价格。"
    />
  );
}
