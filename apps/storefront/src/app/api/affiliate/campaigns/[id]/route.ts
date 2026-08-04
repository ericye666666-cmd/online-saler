import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../../affiliate/affiliate-api";
import { updateAffiliateCampaignStatus } from "../../../../../affiliate/affiliate-platform-service";
import { currentCustomerSession } from "../../../../../auth/customer-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { status?: string };
    return NextResponse.json(
      await updateAffiliateCampaignStatus(await currentCustomerSession(), id, body.status ?? ""),
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return affiliateApiError(error, "affiliate_campaign_update_failed");
  }
}
