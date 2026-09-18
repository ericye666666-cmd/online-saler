import { ProductQueuePage } from "../product-center-client";
import { t } from "@/i18n/runtime";

export default function RejectedPage() {
  return (
    <ProductQueuePage
      queue="rejected"
      title={t("已拒绝")}
      description={t("查看审核拒绝或归档的商品，保留处理记录和审核意见。")}
    />
  );
}
