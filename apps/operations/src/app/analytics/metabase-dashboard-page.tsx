import { ExternalLinkIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { validDashboardUrl } from "./metabase-dashboard-url";

export function MetabaseDashboardPage({
  title,
  description,
  dashboardUrl
}: {
  title: string;
  description: string;
  dashboardUrl?: string;
}) {
  const url = validDashboardUrl(dashboardUrl);
  if (url) redirect(url);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">数据中心 / Metabase</p>
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <Alert>
        <ExternalLinkIcon className="size-4" />
        <AlertTitle>BI 看板尚未连接</AlertTitle>
        <AlertDescription>
          管理员完成 Metabase 初始化后，此入口会自动打开受权限保护的实时看板。
        </AlertDescription>
      </Alert>
    </main>
  );
}
