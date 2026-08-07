import { ProductQueuePage } from "../product-center-client";

export default function RejectedPage() {
  return (
    <ProductQueuePage
      queue="rejected"
      title="已拒绝"
      description="查看审核拒绝或归档的商品，保留处理记录和审核意见。"
    />
  );
}
