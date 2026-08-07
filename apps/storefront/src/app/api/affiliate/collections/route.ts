import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../affiliate/affiliate-api";
import {
  createAffiliateCollection,
  listAffiliateCollections,
} from "../../../../affiliate/affiliate-platform-service";
import { currentCustomerSession } from "../../../../auth/customer-auth";

export async function GET() {
  try {
    return NextResponse.json(
      { collections: await listAffiliateCollections(await currentCustomerSession()) },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return affiliateApiError(error, "affiliate_collections_list_failed");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { title?: string; description?: string; coverImage?: string };
    const collection = await createAffiliateCollection(await currentCustomerSession(), body);
    return NextResponse.json({ collection }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    return affiliateApiError(error, "affiliate_collection_create_failed");
  }
}
