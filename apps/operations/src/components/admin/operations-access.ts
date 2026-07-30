import type { ComponentType, SVGProps } from "react";

export type OperationsLinkedEmployee = {
  id: string;
  employeeCode: string;
  name: string;
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
};

export type NavigationItem = {
  label: string;
  href?: string;
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

export function canAccessPath(pathname: string, modules: readonly NavigationModule[], session: OperationsSession | null): boolean {
  const visibleModules = filterNavigation(modules, session);
  const visibleItems = visibleModules.flatMap((module) => module.items);
  if (pathname === "/") return visibleItems.some((item) => item.href === "/");
  return visibleItems.some((item) => item.href && item.href !== "/" && pathname.startsWith(item.href));
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
