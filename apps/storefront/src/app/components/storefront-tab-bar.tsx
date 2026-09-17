"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, LayoutGrid, User } from "lucide-react";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";
import type { DictionaryKey } from "../../i18n/dictionary";

type Tab = {
  href: string;
  labelKey: DictionaryKey;
  icon: typeof Home;
};

const tabs: Tab[] = [
  { href: "/", labelKey: "tabs.home", icon: Home },
  { href: "/categories", labelKey: "tabs.browse", icon: LayoutGrid },
  { href: "/saved", labelKey: "tabs.saved", icon: Heart },
  { href: "/me", labelKey: "tabs.account", icon: User },
];

// The product page already pins Buy now / Add to bag to the bottom edge, and the
// checkout flow needs the full screen, so the bar steps aside on those routes.
function hidesTabBar(pathname: string): boolean {
  return (
    pathname.startsWith("/p/")
    || pathname.startsWith("/checkout")
    || pathname.startsWith("/cart")
    || pathname.startsWith("/orders/")
  );
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function StorefrontTabBar() {
  const pathname = usePathname() ?? "/";
  const { t } = useStorefrontI18n();
  if (hidesTabBar(pathname)) return null;

  return (
    <nav className="storefrontTabBar" aria-label={t("tabs.label")}>
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`storefrontTab ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={21} strokeWidth={active ? 2.2 : 1.7} />
            <span>{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
