"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The swipeable section row on Browse. Each section is its own page, so the
 * row would open scrolled back to the start; this brings the chosen one
 * (Shoes, Bags, far to the right) back into view.
 */
export function BrowseSectionRail({ label, children }: { label: string; children: ReactNode }) {
  const rail = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = rail.current;
    const active = node?.querySelector<HTMLElement>("a.active");
    if (!node || !active) return;
    const overflow = active.offsetLeft + active.offsetWidth - (node.scrollLeft + node.clientWidth);
    if (overflow > 0) node.scrollLeft += overflow + 18;
  });

  return (
    <nav ref={rail} className="browseSections" aria-label={label}>
      {children}
    </nav>
  );
}
