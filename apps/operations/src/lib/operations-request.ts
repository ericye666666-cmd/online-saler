import { operationsFetch } from "./operations-api";

/**
 * Small JSON wrapper around the operations API proxy. Every page was writing
 * its own copy; this is the same behaviour, named once.
 */

const API_PROXY_URL = "/api-proxy";

export type RequestOptions = RequestInit & {
  query?: Record<string, string | undefined>;
};

export async function operationsRequest<T>(path: string, options?: RequestOptions): Promise<T> {
  const url = new URL(`${API_PROXY_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  const response = await operationsFetch(url.toString(), { ...options, headers });
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text || `Request failed: ${response.status}` };
  }
  if (!response.ok) {
    const detail = body && typeof body === "object" && "message" in body
      ? (body as { message?: unknown }).message
      : null;
    throw new Error(
      Array.isArray(detail) ? detail.join(" ") : typeof detail === "string" ? detail : `Request failed: ${response.status}`
    );
  }
  return body as T;
}

/** Binds the signed-in employee's token to every call from a page. */
export function operationsRequester(accessToken: string) {
  return <T,>(path: string, options?: RequestOptions) => {
    const headers = new Headers(options?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return operationsRequest<T>(path, { ...options, headers });
  };
}

export function formatKsh(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  return `KSh ${amount.toLocaleString("en-KE")}`;
}

export function formatMoment(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
}
