import { ProductQueuePage } from "../product-center-client";
import { t } from "@/i18n/runtime";

export default function Page() {
  return (
    <ProductQueuePage
      queue="all"
      title={t("商品查询")}
      description={t("按商品编号、Barcode、批次、状态、分类或日期查询商品。")}
    />
  );
}
