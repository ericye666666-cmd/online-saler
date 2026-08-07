import { ProductQueuePage } from "../product-center-client";

export default function Page() {
  return (
    <ProductQueuePage
      queue="exceptions"
      title="待处理异常"
      description="集中处理退回返工的商品；完成修正后再回到原批次继续。"
    />
  );
}
