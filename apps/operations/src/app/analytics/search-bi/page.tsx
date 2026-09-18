import { MetabaseDashboardPage } from "../metabase-dashboard-page";
import { t } from "@/i18n/runtime";

// Dashboard URLs are supplied by Cloud Run at runtime, after the image is built.
export const dynamic = "force-dynamic";

export default function SearchBiPage() {
  return (
    <MetabaseDashboardPage
      title={t("搜索分析")}
      description={t("查看关键词排行、七日上升趋势和没有搜索结果的需求机会。")}
      dashboardUrl={process.env.METABASE_SEARCH_DASHBOARD_URL}
    />
  );
}
