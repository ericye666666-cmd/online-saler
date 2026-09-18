import { ProductQueuePage } from "../product-center-client";
import { ProductBatchCalibrationPage } from "../product-batch-calibration-client";
import { t } from "@/i18n/runtime";

export default async function CalibrationPage({ searchParams }: { searchParams: Promise<{ batchId?: string; productId?: string }> }) {
  const { batchId, productId } = await searchParams;
  if (batchId) return <ProductBatchCalibrationPage batchId={batchId} initialProductId={productId} />;
  return (
    <ProductQueuePage
      queue="calibration"
      title={t("图片与信息校准")}
      description={t("对照原图校准 AI 商品信息，手填尺码、成色、瑕疵和价格；确认后直接由原图生成白底展示图。")}
    />
  );
}
