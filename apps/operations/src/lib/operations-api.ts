export const SESSION_ACCESS_TOKEN_KEY = "operations.access.accessToken";
export const LEGACY_SESSION_ADMIN_USER_KEY = "operations.access.adminUserId";
export const OPERATIONS_SESSION_EXPIRED_EVENT = "operations:session-expired";
export const OPERATIONS_SESSION_CHANGED_EVENT = "operations:session-changed";

/** Apply a refresh result only while the session that requested it is still current. */
export function applyToCurrentOperationsSession(accessToken: string, update: () => void): void {
  if (window.localStorage.getItem(SESSION_ACCESS_TOKEN_KEY) === accessToken) update();
}

// This is only a client continuity check. The API verifies the signature and permissions.
export function operationsTokenSubject(token: string | null): string | null {
  const parts = token?.split(".");
  if (!parts || parts.length !== 2 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    return payload && typeof payload === "object" && "sub" in payload && typeof payload.sub === "string"
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}

function requestPrincipals(url: URL, headers: Headers, body: RequestInit["body"]): string[] {
  const actorFields = ["adminUserId", "requesterAdminUserId"];
  const principals = [...actorFields.map((field) => url.searchParams.get(field)), headers.get("X-Admin-User-Id")];
  const bearer = headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  principals.push(operationsTokenSubject(bearer));
  if (typeof body === "string") {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        for (const field of actorFields) {
          const value = (parsed as Record<string, unknown>)[field];
          if (typeof value === "string") principals.push(value);
        }
      }
    } catch {
      // Invalid request bodies remain the API's responsibility.
    }
  } else if (body instanceof FormData) {
    for (const field of actorFields) {
      const value = body.get(field);
      if (typeof value === "string") principals.push(value);
    }
  }
  return principals.filter((principal): principal is string => Boolean(principal));
}

/** Authenticated employee requests must stay on the same-origin API proxy. */
export async function operationsFetch(input: string | URL, options?: RequestInit): Promise<Response> {
  if (typeof window === "undefined") {
    throw new Error("Employee API requests require a browser session.");
  }

  const url = new URL(input, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api-proxy/")) {
    throw new Error("Employee credentials can only be sent to the Operations API proxy.");
  }

  const accessToken = window.localStorage.getItem(SESSION_ACCESS_TOKEN_KEY);
  const headers = new Headers(options?.headers);
  const activePrincipal = operationsTokenSubject(accessToken);
  if (activePrincipal && requestPrincipals(url, headers, options?.body).some((principal) => principal !== activePrincipal)) {
    // Old batch closures carry their original actor. Never resume them under another employee.
    // Preserve the other tab's valid session; only stop this tab's work and return to login.
    window.dispatchEvent(new Event(OPERATIONS_SESSION_CHANGED_EVENT));
    throw new Error("The employee account has changed. Reload the page and sign in before continuing.");
  }
  // Read at request time: uploads and background polling may outlive a render.
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  else headers.delete("Authorization");

  const response = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
    // The proxy returns API responses directly; never forward credentials on a redirect.
    redirect: "error"
  });

  if (response.status === 401 && window.localStorage.getItem(SESSION_ACCESS_TOKEN_KEY) === accessToken) {
    // An old in-flight response must not sign out a newly authenticated employee.
    window.localStorage.removeItem(SESSION_ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_SESSION_ADMIN_USER_KEY);
    window.dispatchEvent(new Event(OPERATIONS_SESSION_EXPIRED_EVENT));
  }

  return response;
}
