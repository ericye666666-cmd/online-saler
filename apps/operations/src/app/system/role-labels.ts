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
  STORE_MANAGER: "门店店长",
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
