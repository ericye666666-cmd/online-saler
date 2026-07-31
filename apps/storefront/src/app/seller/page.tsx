import { currentCustomerSession } from "../../auth/customer-auth";
import { getSellerDashboardForCustomer } from "../../seller/seller-dashboard-service";
import { SellerPortal } from "./seller-portal";

export const dynamic = "force-dynamic";

export default async function SellerPage() {
  const session = await currentCustomerSession();
  const dashboard = await getSellerDashboardForCustomer(session);
  const loginHref = `/login?returnTo=${encodeURIComponent("/seller")}`;

  return (
    <SellerPortal
      initialDashboard={dashboard}
      isAuthenticated={Boolean(session)}
      loginHref={loginHref}
      joinHref="/join-seller"
    />
  );
}
