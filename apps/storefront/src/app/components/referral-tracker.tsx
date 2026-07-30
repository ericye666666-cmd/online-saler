"use client";

import { useEffect } from "react";
import { recordClientEvent } from "../lib/client-events";

export function ReferralTracker({
  sellerRef,
  productCode,
}: {
  sellerRef?: string;
  productCode?: string;
}) {
  useEffect(() => {
    if (!sellerRef) return;
    recordClientEvent({
      eventType: "referral_visit",
      sellerRef,
      productCode,
    });
  }, [productCode, sellerRef]);

  return null;
}
