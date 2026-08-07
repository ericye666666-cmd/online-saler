import type { OperationsPermission, OperationsRole, OperationsSession } from "@/components/admin/operations-access";

const API_PROXY_URL = "/api-proxy";

export async function accessRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PROXY_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text || `Request failed: ${response.status}` };
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function adminQuery(adminUserId: string): string {
  return new URLSearchParams({ adminUserId }).toString();
}

export type AdminUserAccount = OperationsSession;
export type RoleRecord = OperationsRole;
export type PermissionRecord = OperationsPermission;
