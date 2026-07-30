import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { OperationsAdminShell } from "@/components/admin/operations-admin-shell";
import { OperationsAccessProvider } from "@/components/admin/operations-access-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Online Saler Operations",
  description: "Employee operations workspace."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-theme-preset="default" data-content-layout="full" data-navbar-style="sticky">
      <body>
        <TooltipProvider>
          <OperationsAccessProvider>
            <OperationsAdminShell>{children}</OperationsAdminShell>
          </OperationsAccessProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
