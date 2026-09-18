import { MetabaseDashboardPage } from "../metabase-dashboard-page";
import { t } from "@/i18n/runtime";

// Dashboard URLs are supplied by Cloud Run at runtime, after the image is built.
export const dynamic = "force-dynamic";

export default function WarehouseBiPage() {
  return (
    <MetabaseDashboardPage
      title={t("高级仓库分析")}
      description={t("查看服装分类结构、实时库存、销售表现和每日上新速度。")}
      dashboardUrl={process.env.METABASE_WAREHOUSE_DASHBOARD_URL}
    />
  );
}
