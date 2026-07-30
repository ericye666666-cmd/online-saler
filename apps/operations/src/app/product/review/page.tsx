import { ProductQueuePage } from "../product-center-client";

export default function ReviewPage() {
  return (
    <ProductQueuePage
      queue="review"
      title="待审核"
      description="审核商品资料、图片、Barcode 和入库准备状态，可通过、退回修改或拒绝。"
    />
  );
}
