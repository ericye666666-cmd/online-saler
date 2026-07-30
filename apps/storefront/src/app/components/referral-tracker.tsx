"use client";

import { useEffect } from "react";
import { recordClientEvent } from "../lib/client-events";

export function ReferralTracker({
  sellerRef,
  productCode,
  source,
  campaign,
}: {
  sellerRef?: string;
  productCode?: string;
  source?: string;
  campaign?: string;
}) {
  useEffect(() => {
    if (!sellerRef) return;
    recordClientEvent({
      eventType: "referral_visit",
      sellerRef,
      productCode,
    });
    const sessionId = getAffiliateSessionId();
    void fetch("/api/affiliate/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerRef,
        productCode,
        source,
        campaign,
        sessionId,
        landingPath: window.location.pathname
      })
    }).catch(() => undefined);
  }, [campaign, productCode, sellerRef, source]);

  return null;
}

function getAffiliateSessionId(): string {
  const key = "direct_loop_affiliate_session";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}
