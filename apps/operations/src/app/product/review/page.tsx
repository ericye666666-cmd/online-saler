import { ProductQueuePage } from "../product-center-client";
import { ProductBatchReviewPage } from "../product-batch-review-client";
import { t } from "@/i18n/runtime";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ batchId?: string }> }) {
  const { batchId } = await searchParams;
  if (batchId) return <ProductBatchReviewPage batchId={batchId} />;
  return (
    <ProductQueuePage
      queue="review"
      title={t("待审核")}
      description={t("审核商品资料、图片、Barcode 和入库准备状态，可通过、退回修改或拒绝。")}
    />
  );
}
