import { ProductQueuePage } from "../product-center-client";

export default function Page() {
  return (
    <ProductQueuePage
      queue="all"
      title="商品查询"
      description="按商品编号、Barcode、批次、状态、分类或日期查询商品。"
    />
  );
}
