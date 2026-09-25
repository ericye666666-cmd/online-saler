import { t } from "@/i18n/runtime";

/**
 * What each role is called, for the people choosing one.
 *
 * The account screens listed roles by their raw code — WAREHOUSE_FULFILLMENT,
 * AFFILIATE_OPERATIONS — which is the same unreadable string in both languages.
 * Whoever opens an account for a new picker had to already know which code meant
 * "warehouse", and getting it wrong hands somebody the wrong half of the system.
 *
 * Chinese is the key, as everywhere else here, so the English lives in
 * enDictionary and the dictionary test holds both languages to the same list.
 * The code still travels with the label: it is what the API takes, what the
 * permission matrix shows, and what anyone reading the logs will see.
 */
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "超级管理员",
  PROJECT_MANAGER: "项目经理",
  PRODUCT_DIGITIZATION: "商品数字化",
  WAREHOUSE_FULFILLMENT: "仓库履约",
  // Stores no longer tell 店长 from 店员: everyone at a store holds this one
  // role. The code stays STORE_MANAGER — permissions and the store ERP use it.
  STORE_MANAGER: "门店员工",
  DELIVERY_RIDER: "配送骑手",
  ORDER_OPERATIONS: "订单运营",
  AFFILIATE_OPERATIONS: "推广运营",
  CUSTOMER_SERVICE: "客服",
  FINANCE: "财务",
  DATA_ANALYST: "数据分析师"
};

/** The Chinese source strings, for the dictionary test to hold to English. */
export const ROLE_LABEL_SOURCES = Object.values(ROLE_LABELS);

/** A role as a person reads it. An unknown code falls back to itself. */
export function roleLabel(code: string): string {
  const label = ROLE_LABELS[code];
  return label ? t(label) : code;
}

/** Label plus code, for a dropdown where the code still has to be pickable. */
export function roleOptionLabel(code: string): string {
  const label = ROLE_LABELS[code];
  return label ? `${t(label)} · ${code}` : code;
}

/**
 * Which department a role belongs to, for filtering the account list.
 *
 * There is no department field on an account: the owner decided it follows
 * from the role, so there is no second thing to keep in step. Riders count as
 * 门店端, because they work out of a store and its staff keep their roster.
 *
 * Every role in OPERATIONS_ROLE_BLUEPRINTS has to be listed here — the test in
 * role-departments.test.ts fails when a new role is added without one. A role
 * made by hand on the roles screen falls under 其他 rather than vanishing.
 *
 * 商品部 rather than 商品: the dictionary already reads 商品 as "Item".
 */
export const DEPARTMENTS = ["管理层", "商品部", "仓库", "门店端", "推广", "客服", "财务", "其他"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const OTHER_DEPARTMENT: Department = "其他";

export const ROLE_DEPARTMENTS: Record<string, Exclude<Department, "其他">> = {
  SUPER_ADMIN: "管理层",
  // Runs the day's operation across every area without touching users or
  // roles: a manager over the departments, not a worker in one of them.
  PROJECT_MANAGER: "管理层",
  // Reads and exports analytics for the whole operation, for management.
  DATA_ANALYST: "管理层",
  PRODUCT_DIGITIZATION: "商品部",
  WAREHOUSE_FULFILLMENT: "仓库",
  ORDER_OPERATIONS: "仓库",
  STORE_MANAGER: "门店端",
  DELIVERY_RIDER: "门店端",
  AFFILIATE_OPERATIONS: "推广",
  CUSTOMER_SERVICE: "客服",
  FINANCE: "财务"
};

/** The department a role code belongs to; an unknown code is 其他. */
export function roleDepartment(code: string): Department {
  return ROLE_DEPARTMENTS[code] ?? OTHER_DEPARTMENT;
}

/** The departments an account falls under; an account with no role is 其他. */
export function accountDepartments(roleCodes: string[]): Department[] {
  if (roleCodes.length === 0) return [OTHER_DEPARTMENT];
  return [...new Set(roleCodes.map(roleDepartment))];
}
