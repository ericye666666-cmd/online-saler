import { MetabaseDashboardPage } from "../metabase-dashboard-page";

export default function SearchBiPage() {
  return (
    <MetabaseDashboardPage
      title="搜索分析"
      description="查看关键词排行、七日上升趋势和没有搜索结果的需求机会。"
      dashboardUrl={process.env.METABASE_SEARCH_DASHBOARD_URL}
    />
  );
}
