"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { useAffiliateSession } from "../../affiliate/affiliate-client";

type SellerHeaderActionProps = {
  variant?: "desktop" | "mobile-menu" | "mobile-compact";
};

export function SellerHeaderAction({ variant = "desktop" }: SellerHeaderActionProps) {
  const { payload, loading } = useAffiliateSession();
  const activeAffiliate = Boolean(payload?.affiliate);
  const action = activeAffiliate
    ? { label: "Affiliate Center", href: "/seller", active: true }
    : { label: loading ? "Affiliate" : "Become an Affiliate", href: "/become-affiliate", active: false };
  const className = variant === "mobile-compact"
    ? "depopMobileSellerButton"
    : action.active
      ? "depopPrimaryAction"
      : "depopSecondaryAction";

  return (
    <Link className={className} href={action.href} aria-disabled={loading || undefined}>
      {variant === "mobile-menu" && action.active ? <UserRound size={18} /> : null}
      {action.label}
    </Link>
  );
}
