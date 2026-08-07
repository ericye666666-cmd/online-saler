import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../affiliate/affiliate-api";
import { becomeAffiliate } from "../../../../affiliate/affiliate-platform-service";
import { currentCustomerSession } from "../../../../auth/customer-auth";

export async function POST() {
  try {
    const affiliate = await becomeAffiliate(await currentCustomerSession());
    return NextResponse.json({ affiliate }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    return affiliateApiError(error, "affiliate_enroll_failed");
  }
}
