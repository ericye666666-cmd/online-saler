import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../../affiliate/affiliate-api";
import {
  deleteAffiliateCollection,
  updateAffiliateCollection,
} from "../../../../../affiliate/affiliate-platform-service";
import { currentCustomerSession } from "../../../../../auth/customer-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as {
      title?: string;
      description?: string | null;
      coverImage?: string | null;
      action?: string;
    };
    const collection = await updateAffiliateCollection(await currentCustomerSession(), id, body);
    return NextResponse.json({ collection }, { headers: noStoreHeaders });
  } catch (error) {
    return affiliateApiError(error, "affiliate_collection_update_failed");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(
      await deleteAffiliateCollection(await currentCustomerSession(), id),
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return affiliateApiError(error, "affiliate_collection_delete_failed");
  }
}
