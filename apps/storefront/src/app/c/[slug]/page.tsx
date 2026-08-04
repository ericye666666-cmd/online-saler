import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Share2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getPublicCollection } from "../../../affiliate/affiliate-platform-service";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { AffiliatePublicProductCard } from "../../components/affiliate-public-product-card";
import { ReferralTracker } from "../../components/referral-tracker";
import { SiteHeader } from "../../components/site-header";

type PageProps = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const collection = await getPublicCollection((await params).slug);
  if (!collection) return {};
  return { title: `${collection.title} · Direct Loop Collection`, description: collection.description || `${collection.itemCount} curated second-hand products.` };
}

export default async function PublicCollectionPage({ params }: PageProps) {
  const collection = await getPublicCollection((await params).slug);
  if (!collection) notFound();
  const campaign = `collection-${collection.slug}`;
  return (
    <main className="min-h-screen bg-[#f6f3ee]">
      <ReferralTracker sellerRef={collection.affiliate.affiliateCode} collectionSlug={collection.slug} source="collection-page" placement="collection-view" campaign={campaign} />
      <SiteHeader sellerRef={collection.affiliate.affiliateCode} />
      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:py-16">
        <div className="overflow-hidden rounded-3xl bg-[#e8e1d8] shadow-sm">{collection.coverImage ? <img src={collection.coverImage} alt="" className="aspect-[4/3] h-full w-full object-cover" /> : <div className="aspect-[4/3]" />}</div>
        <div><Badge>Affiliate Collection</Badge><h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">{collection.title}</h1><p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">{collection.description || `A ${collection.itemCount}-piece edit curated for Direct Loop shoppers.`}</p><div className="mt-6 flex flex-wrap items-center gap-3"><Button asChild variant="outline"><Link href={`/seller/${collection.affiliate.slug}`}><ArrowLeft /> {collection.affiliate.displayName}</Link></Button><span className="text-sm text-muted-foreground">{collection.itemCount} products</span></div></div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-6"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-bold">Shop the Collection</h2><Share2 /></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{collection.products.map((product) => <AffiliatePublicProductCard key={product.id} product={product} affiliateCode={collection.affiliate.affiliateCode} source="collection-page" campaign={campaign} />)}</div></section>
    </main>
  );
}
