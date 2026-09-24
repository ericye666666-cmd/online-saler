import type { ComponentType, SVGProps } from "react";

export type OperationsLinkedEmployee = {
  id: string;
  employeeCode: string;
  name: string;
  /** Which store this person belongs to, or null for warehouse and head office. */
  homeNodeId?: string | null;
  homeNodeName?: string | null;
};

export type OperationsAdminUser = {
  id: string;
  name: string;
  email?: string | null;
  loginAccount: string;
  phone?: string | null;
  status: "ACTIVE" | "DISABLED" | "LOCKED";
  linkedEmployeeId?: string | null;
  linkedEmployee?: OperationsLinkedEmployee | null;
  lastLoginAt?: string | null;
};

export type OperationsPermission = {
  id?: string;
  code: string;
  module: string;
  scope?: "MODULE" | "PAGE" | "ACTION";
  page?: string | null;
  action?: string | null;
  description?: string | null;
};

export type OperationsRole = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  permissions: OperationsPermission[];
};

export type OperationsSession = {
  adminUser: OperationsAdminUser | null;
  roles: OperationsRole[];
  permissions: string[];
  accessToken?: string;
  accessTokenExpiresAt?: string;
};

export type NavigationItem = {
  label: string;
  href?: string;
  routePrefixes?: string[];
  permission?: string;
  actionPermission?: string;
  badge?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

export type NavigationModule = {
  key: string;
  label: string;
  permission?: string;
  items: NavigationItem[];
};

export function hasPermission(session: OperationsSession | null, permission?: string): boolean {
  if (!permission) return true;
  return Boolean(session?.permissions.includes(permission));
}

export function filterNavigation<T extends NavigationModule>(modules: readonly T[], session: OperationsSession | null): T[] {
  return modules
    .map((module) => ({
      ...module,
      items: module.items.filter((item) => hasPermission(session, item.permission))
    }) as T)
    .filter((module) => hasPermission(session, module.permission) && module.items.length > 0);
}

/**
 * Where to send someone who has landed somewhere they cannot open.
 *
 * The home page belongs to 商品中心 and needs a product permission, so every
 * role that is not on the product side — the store desk, the warehouse, the
 * rider, finance, customer service — would sign in and get a 403 before
 * touching anything.
 *
 * Their end is the one they can open the most of. Taking the first visible end
 * instead sent the warehouse to 货架位管理, because a picker carries
 * `module.product` for two lookup screens while their actual morning — five
 * screens of it — is in 仓库发货. Depth of access is what distinguishes the end
 * someone works in from the ones they can merely see into, and it needs no
 * table of roles to keep in step with the navigation.
 *
 * Ties keep navigation order, so an end that comes first in the sidebar wins
 * against one further down that it matches.
 */
/**
 * Pages a role opens into no matter how much else it can see.
 *
 * Depth of access tells you where someone works only while some of the app is
 * closed to them. A super admin can open all of it, so the measure says nothing
 * and lands them wherever the biggest end happens to be — 数据中心 today, some
 * other end after the next feature. Naming the end is not enough either: the
 * first page of 系统管理 is 商品工厂配置, which is product configuration that
 * happens to live there. The page is named because the claim is about one page.
 *
 * Keep this short. An entry says a role's job cannot be read from its
 * permissions, which is true of an administrator and almost nobody else.
 */
const ROLE_HOME_PAGE: Record<string, string> = {
  // Administering people is the job. A super admin holds every permission, so
  // every other measure points somewhere arbitrary.
  SUPER_ADMIN: "/system/accounts"
};

/**
 * Where a role opens after signing in.
 *
 * Only signing in uses this. Visiting "/" on purpose afterwards stays on "/",
 * so a super admin can still open 今日工作 from the menu — a landing preference
 * must not turn into a page nobody can reach.
 */
export function landingPath(modules: readonly NavigationModule[], session: OperationsSession | null): string | null {
  for (const role of session?.roles ?? []) {
    const href = ROLE_HOME_PAGE[role.code];
    // A named page still has to be one this role can open, so a permission
    // taken away in 角色管理 drops them back to the general rule rather than
    // onto a 403.
    if (href && canAccessPath(href, modules, session)) return href;
  }
  return firstAllowedPath(modules, session);
}

export function firstAllowedPath(modules: readonly NavigationModule[], session: OperationsSession | null): string | null {
  const ends = modules
    .filter((module) => hasPermission(session, module.permission))
    .map((module) => ({
      // The home page is nobody's landing: redirecting to it is the loop this
      // whole function exists to break.
      open: module.items.filter((item) => item.href && item.href !== "/" && hasPermission(session, item.permission))
    }))
    .filter((end) => end.open.length > 0);

  if (!ends.length) return null;
  const home = [...ends].sort((left, right) => right.open.length - left.open.length)[0]!;
  return home.open[0]!.href ?? null;
}

export function canAccessPath(pathname: string, modules: readonly NavigationModule[], session: OperationsSession | null): boolean {
  // Embedded screens are not in the sidebar, so the lookup below would find no
  // item and refuse them. They are named here instead, with the same permission
  // as the full screen they are a phone-sized view of.
  if (pathname === "/embed/store") return hasPermission(session, "page.orders.node");
  if (pathname === "/system/warehouse/locations") return hasPermission(session, "page.product.warehouse-locations");
  if (pathname === "/warehouse/inventory") return hasPermission(session, "warehouse-locations.view");
  if (pathname === "/warehouse" || pathname.startsWith("/warehouse/")) return hasPermission(session, "orders.view");

  const items = modules.flatMap((module) => module.items);
  if (pathname === "/") {
    const home = items.find((item) => item.href === "/");
    return Boolean(home && hasPermission(session, home.permission));
  }

  const exact = items.find((item) => item.href === pathname);
  if (exact) return hasPermission(session, exact.permission);

  const prefixMatch = items
    .flatMap((item) => (item.routePrefixes ?? []).map((prefix) => ({ item, prefix })))
    .filter(({ prefix }) => pathname.startsWith(prefix))
    .sort((left, right) => right.prefix.length - left.prefix.length)[0];
  if (prefixMatch) return hasPermission(session, prefixMatch.item.permission);

  const orderDetail = pathname.match(/^\/orders\/[^/]+$/);
  if (orderDetail) return hasPermission(session, "orders.view");

  const parent = items
    .filter((item) => item.href && item.href !== "/" && pathname.startsWith(`${item.href}/`))
    .sort((left, right) => (right.href?.length ?? 0) - (left.href?.length ?? 0))[0];
  return Boolean(parent && hasPermission(session, parent.permission));
}

export function adminInitials(adminUser: OperationsAdminUser | null): string {
  if (!adminUser?.name) return "OS";
  const parts = adminUser.name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "OS";
}

export function roleLabels(session: OperationsSession | null): string {
  return session?.roles.map((role) => role.name).join(", ") || "No role";
}
