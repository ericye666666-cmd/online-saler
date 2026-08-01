export const ORDER_STATUS_TABS = [
  ["all", "全部"],
  ["pending-payment", "待付款"],
  ["waiting-pick", "待拣货"],
  ["picking", "拣货中"],
  ["ready-to-pack", "待打包"],
  ["packed", "已打包"],
  ["ready-for-pickup", "待自提"],
  ["ready-for-dispatch", "待发货"],
  ["out-for-delivery", "配送中"],
  ["completed", "已完成"],
  ["after-sale", "售后中"],
  ["cancelled", "已取消"]
] as const;

export type OrderStatusTab = (typeof ORDER_STATUS_TABS)[number][0];

const LEGACY_WAREHOUSE_ROUTES: Record<string, string> = {
  "/warehouse": "/orders",
  "/warehouse/picking": "/orders/all?status=waiting-pick",
  "/warehouse/picking-active": "/orders/all?status=picking",
  "/warehouse/packing": "/orders/all?status=ready-to-pack",
  "/warehouse/packed": "/orders/all?status=packed",
  "/warehouse/pickup": "/orders/all?status=ready-for-pickup",
  "/warehouse/delivery": "/orders/all?status=ready-for-dispatch",
  "/warehouse/completed": "/orders/all?status=completed",
  "/warehouse/exceptions": "/orders/exceptions",
  "/warehouse/inventory": "/system/warehouse/locations"
};

export function legacyWarehouseRedirect(pathname: string): string {
  return LEGACY_WAREHOUSE_ROUTES[pathname] ?? "/orders";
}
