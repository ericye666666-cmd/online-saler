"use client";

import { useEffect, useState } from "react";
import type { stockedMenu } from "../shop-taxonomy";

export type ShopMenu = ReturnType<typeof stockedMenu>;

// One request per page load, shared by every header on the page.
let pending: Promise<ShopMenu> | null = null;

export function useShopMenu(): ShopMenu {
  const [menu, setMenu] = useState<ShopMenu>([]);
  useEffect(() => {
    pending ??= fetch("/api/shop-menu")
      .then((response) => (response.ok ? response.json() as Promise<ShopMenu> : []))
      .catch(() => {
        pending = null;
        return [];
      });
    let live = true;
    void pending.then((next) => { if (live) setMenu(next); });
    return () => { live = false; };
  }, []);
  return menu;
}
