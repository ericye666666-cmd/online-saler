import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../../affiliate/affiliate-api";
import { setProductCollections } from "../../../../../affiliate/affiliate-platform-service";
import { currentCustomerSession } from "../../../../../auth/customer-auth";

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { productCode?: string; collectionIds?: string[] };
    if (!body.productCode?.trim() || !Array.isArray(body.collectionIds)) {
      return NextResponse.json({ error: "Product and Collection selection are required." }, { status: 400, headers: noStoreHeaders });
    }
    const collections = await setProductCollections(
      await currentCustomerSession(),
      body.productCode,
      body.collectionIds,
    );
    return NextResponse.json({ collections }, { headers: noStoreHeaders });
  } catch (error) {
    return affiliateApiError(error, "affiliate_collection_product_failed");
  }
}
