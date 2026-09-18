import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { OperationsAdminShell } from "@/components/admin/operations-admin-shell";
import { OperationsAccessProvider } from "@/components/admin/operations-access-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OperationsI18nProvider } from "@/i18n/provider";
import { operationsLocaleFromCookies } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Online Saler Operations",
  description: "Employee operations workspace."
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await operationsLocaleFromCookies();

  return (
    <html lang={locale} data-theme-preset="default" data-content-layout="full" data-navbar-style="sticky">
      <body>
        <OperationsI18nProvider initialLocale={locale}>
          <TooltipProvider>
            <OperationsAccessProvider>
              <OperationsAdminShell>{children}</OperationsAdminShell>
            </OperationsAccessProvider>
          </TooltipProvider>
        </OperationsI18nProvider>
      </body>
    </html>
  );
}
