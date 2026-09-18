import { ProductQueuePage } from "../product-center-client";
import { t } from "@/i18n/runtime";

export default function PublishedPage() {
  return (
    <ProductQueuePage
      queue="published"
      title={t("已发布")}
      description={t("查看已经通过检查并发布到商城的线上商品。")}
    />
  );
}
