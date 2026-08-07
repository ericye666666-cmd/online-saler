import { randomUUID } from "node:crypto";
import { AffiliateAssetStatus, ProductStatus, prisma } from "@online-saler/database";
import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../../affiliate/affiliate-api";
import { uploadAffiliateAsset } from "../../../../../affiliate/affiliate-asset-storage";
import { requireActiveAffiliate } from "../../../../../affiliate/affiliate-platform-service";
import { buildAffiliatePath } from "../../../../../affiliate/affiliate-platform";
import { currentCustomerSession } from "../../../../../auth/customer-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const affiliate = await requireActiveAffiliate(await currentCustomerSession());
    const form = await request.formData();
    const file = form.get("file");
    const productCode = String(form.get("productCode") ?? "").trim();
    if (!(file instanceof File) || file.type !== "image/png") return NextResponse.json({ error: "A Share Card PNG is required." }, { status: 400, headers: noStoreHeaders });
    const product = await prisma.product.findFirst({ where: { productCode, status: ProductStatus.PUBLISHED }, select: { id: true, productCode: true } });
    if (!product) return NextResponse.json({ error: "Product was not found." }, { status: 404, headers: noStoreHeaders });
    const id = randomUUID();
    const affiliateLink = buildAffiliatePath(`/p/${product.productCode}`, affiliate.affiliateCode, { source: "share-card", placement: "download", campaign: "organic" });
    const objectName = `staging/affiliate-assets/${affiliate.id}/share-cards/${id}.png`;
    await prisma.shareCard.create({ data: { id, affiliateId: affiliate.id, productId: product.id, affiliateLink, status: AffiliateAssetStatus.PROCESSING } });
    try {
      const storageUrl = await uploadAffiliateAsset(objectName, "image/png", Buffer.from(await file.arrayBuffer()));
      await prisma.shareCard.update({ where: { id }, data: { status: AffiliateAssetStatus.READY, storageObjectKey: storageUrl ? objectName : null } });
      return NextResponse.json({ id, status: "READY", stored: Boolean(storageUrl) }, { status: 201, headers: noStoreHeaders });
    } catch (error) {
      await prisma.shareCard.update({ where: { id }, data: { status: AffiliateAssetStatus.FAILED } });
      throw error;
    }
  } catch (error) {
    return affiliateApiError(error, "affiliate_share_card_store_failed");
  }
}
