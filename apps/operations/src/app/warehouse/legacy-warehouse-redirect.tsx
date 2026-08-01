import { redirect } from "next/navigation";
import { legacyWarehouseRedirect } from "../orders/order-center-routes";

export function LegacyWarehouseRedirect({ pathname }: { pathname: string }) {
  return redirect(legacyWarehouseRedirect(pathname));
}
