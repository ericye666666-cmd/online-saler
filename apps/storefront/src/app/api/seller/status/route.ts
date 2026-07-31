import { NextResponse } from "next/server";
import { currentCustomerSession } from "../../../../auth/customer-auth";
import { getActiveSellerForCustomer } from "../../../../seller/seller-dashboard-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentCustomerSession();
  const seller = await getActiveSellerForCustomer(session);
  return NextResponse.json({
    authenticated: Boolean(session),
    seller: seller
      ? {
          id: seller.id,
          affiliateCode: seller.affiliateCode,
          displayName: seller.displayName,
          status: seller.status
        }
      : null
  });
}
