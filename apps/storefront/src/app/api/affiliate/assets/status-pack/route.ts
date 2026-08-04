import { randomUUID } from "node:crypto";
import { AffiliateAssetStatus, prisma } from "@online-saler/database";
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
    const collectionId = String(form.get("collectionId") ?? "").trim();
    const itemCount = Number(form.get("itemCount"));
    if (!(file instanceof File) || file.type !== "application/zip") return NextResponse.json({ error: "A Status Pack ZIP is required." }, { status: 400, headers: noStoreHeaders });
    if (![4, 6, 8].includes(itemCount)) return NextResponse.json({ error: "Status Pack size must be 4, 6, or 8." }, { status: 400, headers: noStoreHeaders });
    const collection = await prisma.collection.findFirst({ where: { id: collectionId, affiliateId: affiliate.id }, select: { id: true, slug: true } });
    if (!collection) return NextResponse.json({ error: "Collection was not found." }, { status: 404, headers: noStoreHeaders });
    const id = randomUUID();
    const affiliateLink = buildAffiliatePath(`/c/${collection.slug}`, affiliate.affiliateCode, { source: "whatsapp-status", placement: "status-pack", campaign: `status-pack-${collection.slug}` });
    const objectName = `staging/affiliate-assets/${affiliate.id}/status-packs/${id}.zip`;
    await prisma.statusPack.create({ data: { id, affiliateId: affiliate.id, collectionId: collection.id, itemCount, pageCount: itemCount, affiliateLink, status: AffiliateAssetStatus.PROCESSING } });
    try {
      const storageUrl = await uploadAffiliateAsset(objectName, "application/zip", Buffer.from(await file.arrayBuffer()));
      await prisma.statusPack.update({ where: { id }, data: { status: AffiliateAssetStatus.READY, storageObjectKey: storageUrl ? objectName : null } });
      return NextResponse.json({ id, status: "READY", stored: Boolean(storageUrl) }, { status: 201, headers: noStoreHeaders });
    } catch (error) {
      await prisma.statusPack.update({ where: { id }, data: { status: AffiliateAssetStatus.FAILED } });
      throw error;
    }
  } catch (error) {
    return affiliateApiError(error, "affiliate_status_pack_store_failed");
  }
}
