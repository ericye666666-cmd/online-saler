"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type SellerStatusResponse = {
  seller?: {
    id: string;
    affiliateCode: string;
    displayName: string;
    status: string;
  } | null;
};

type SellerHeaderActionProps = {
  variant?: "desktop" | "mobile-menu" | "mobile-compact";
};

export function SellerHeaderAction({ variant = "desktop" }: SellerHeaderActionProps) {
  const [activeSeller, setActiveSeller] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/seller/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: SellerStatusResponse | null) => {
        if (!active) return;
        setActiveSeller(Boolean(payload?.seller));
      })
      .catch(() => {
        if (active) setActiveSeller(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const action = activeSeller
    ? { label: "推广者中台", href: "/seller", active: true }
    : { label: "Join seller", href: "/join-seller", active: false };
  const className = variant === "mobile-compact"
    ? "depopMobileSellerButton"
    : action.active
      ? "depopPrimaryAction"
      : "depopSecondaryAction";

  return (
    <Link className={className} href={action.href}>
      {variant === "mobile-menu" && action.active ? <UserRound size={18} /> : null}
      {action.label}
    </Link>
  );
}
