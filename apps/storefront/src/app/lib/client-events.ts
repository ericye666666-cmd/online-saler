"use client";

export type ClientCatalogEventType =
  | "share_action"
  | "referral_visit"
  | "contact_click"
  | "order_report";

const SESSION_KEY = "direct-loop-catalog-session";

function sessionId() {
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

export function recordClientEvent(input: {
  eventType: ClientCatalogEventType;
  productCode?: string;
  sellerRef?: string;
}) {
  const body = JSON.stringify({
    ...input,
    sessionId: sessionId(),
    pagePath: `${window.location.pathname}${window.location.search}`,
  });

  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
