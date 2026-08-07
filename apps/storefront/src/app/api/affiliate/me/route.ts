import { NextResponse } from "next/server";
import { noStoreHeaders } from "../../../../affiliate/affiliate-api";
import {
  getActiveAffiliateForCustomer,
  getAffiliateDashboard,
  listAffiliateCampaigns,
  listAffiliateCollections,
} from "../../../../affiliate/affiliate-platform-service";
import { currentCustomerSession } from "../../../../auth/customer-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentCustomerSession();
  if (!session) return NextResponse.json({ authenticated: false, affiliate: null }, { headers: noStoreHeaders });
  const affiliate = await getActiveAffiliateForCustomer(session);
  if (!affiliate) return NextResponse.json({ authenticated: true, affiliate: null }, { headers: noStoreHeaders });

  const [collections, campaigns, dashboard] = await Promise.all([
    listAffiliateCollections(session),
    listAffiliateCampaigns(session),
    getAffiliateDashboard(session),
  ]);
  return NextResponse.json(
    { authenticated: true, affiliate, collections, campaigns, dashboard },
    { headers: noStoreHeaders },
  );
}
