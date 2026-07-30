import "./globals.css";
import "./customer-auth.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Online Saler Storefront",
  description: "Kikuyu second-hand fashion storefront foundation."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
