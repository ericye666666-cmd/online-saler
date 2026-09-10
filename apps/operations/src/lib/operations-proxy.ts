/** Next route parameters are decoded; do not interpret them as another URL. */
export function operationsProxyTarget(apiUrl: string, requestUrl: string, path: string[]): string | null {
  for (const segment of path) {
    if (!segment || segment === "." || segment === ".." || /[\\/%:\u0000-\u001f\u007f]/.test(segment)) {
      return null;
    }
  }

  const base = new URL(apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
  const target = new URL(path.map(encodeURIComponent).join("/"), base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return null;
  target.search = new URL(requestUrl).search;
  return target.toString();
}
