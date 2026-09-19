import "./globals.css";
import "./customer-auth.css";
import "./checkout-reservation.css";
import "./cart-checkout.css";
import "./storefront-tab-bar.css";
import "./storefront-tab-pages.css";
import "./storefront-home-feed.css";
import "./storefront-product-page.css";
import "./storefront-bag.css";
import { Inter, Playfair_Display } from "next/font/google";
import { StorefrontTabBar } from "./components/storefront-tab-bar";

// Self-hosted at build time, so the storefront never waits on a third party and
// an Android phone gets the same faces as a desktop. Latin only: Chinese falls
// through to the system CJK face, which every device already has.
const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans"
});

const display = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
  variable: "--font-display"
});
import { SITE_URL } from "./data/products";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getStorefrontI18n } from "../i18n/server";
import { StorefrontI18nProvider } from "../i18n/provider";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Online Saler Storefront",
  description: "Kikuyu second-hand fashion storefront foundation."
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale } = await getStorefrontI18n();
  return (
    <html lang={locale} className={`${sans.variable} ${display.variable}`}>
      <body>
        <StorefrontI18nProvider locale={locale}>
          {children}
          <StorefrontTabBar />
        </StorefrontI18nProvider>
      </body>
    </html>
  );
}
