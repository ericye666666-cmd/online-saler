import { ProductQueuePage } from "../product-center-client";
import { t } from "@/i18n/runtime";

export default function Page() {
  return (
    <ProductQueuePage
      queue="exceptions"
      title={t("待处理异常")}
      description={t("集中处理退回返工的商品；完成修正后再回到原批次继续。")}
    />
  );
}
