import { MetabaseDashboardPage } from "../metabase-dashboard-page";

export default function WarehouseBiPage() {
  return (
    <MetabaseDashboardPage
      title="高级仓库分析"
      description="查看服装分类结构、实时库存、销售表现和每日上新速度。"
      dashboardUrl={process.env.METABASE_WAREHOUSE_DASHBOARD_URL}
    />
  );
}
