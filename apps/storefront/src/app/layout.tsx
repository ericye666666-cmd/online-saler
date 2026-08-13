import "./globals.css";
import "./customer-auth.css";
import "./checkout-reservation.css";
import "./cart-checkout.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getStorefrontI18n } from "../i18n/server";
import { StorefrontI18nProvider } from "../i18n/provider";

export const metadata: Metadata = {
  title: "Online Saler Storefront",
  description: "Kikuyu second-hand fashion storefront foundation."
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale } = await getStorefrontI18n();
  return (
    <html lang={locale}>
      <body><StorefrontI18nProvider locale={locale}>{children}</StorefrontI18nProvider></body>
    </html>
  );
}
