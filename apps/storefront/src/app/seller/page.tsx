import { redirect } from "next/navigation";
import { getActiveAffiliateForCustomer } from "../../affiliate/affiliate-platform-service";
import { currentCustomerSession } from "../../auth/customer-auth";
import { AffiliateCenter } from "./affiliate-center";

export const dynamic = "force-dynamic";

export default async function SellerPage() {
  const session = await currentCustomerSession();
  if (!session) redirect(`/login?returnTo=${encodeURIComponent("/seller")}`);
  if (!await getActiveAffiliateForCustomer(session)) redirect("/become-affiliate");
  return <AffiliateCenter />;
}
