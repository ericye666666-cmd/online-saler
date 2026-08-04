import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../affiliate/affiliate-api";
import {
  createAffiliateCampaign,
  listAffiliateCampaigns,
} from "../../../../affiliate/affiliate-platform-service";
import { currentCustomerSession } from "../../../../auth/customer-auth";

export async function GET() {
  try {
    return NextResponse.json(
      { campaigns: await listAffiliateCampaigns(await currentCustomerSession()) },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return affiliateApiError(error, "affiliate_campaigns_list_failed");
  }
}

export async function POST(request: Request) {
  try {
    const campaign = await createAffiliateCampaign(
      await currentCustomerSession(),
      await request.json(),
    );
    return NextResponse.json({ campaign }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    return affiliateApiError(error, "affiliate_campaign_create_failed");
  }
}
