import { ProductQueuePage } from "../product-center-client";
import { t } from "@/i18n/runtime";

export default function Page() {
  return <ProductQueuePage queue="all" management title={t("商品管理")} description={t("搜索商品、修改售价、编辑标题与详情文案、调整主图，并管理单件商品上下架。")} />;
}
