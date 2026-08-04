import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FolderHeart, Share2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getPublicAffiliateProfile } from "../../../affiliate/affiliate-platform-service";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { ReferralTracker } from "../../components/referral-tracker";
import { SiteHeader } from "../../components/site-header";
import { AffiliatePublicProductCard } from "../../components/affiliate-public-product-card";

type PageProps = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const profile = await getPublicAffiliateProfile((await params).slug);
  if (!profile) return {};
  return { title: `${profile.displayName} · Direct Loop Affiliate`, description: profile.bio || `Shop ${profile.displayName}'s curated Direct Loop Collections.` };
}

export default async function PublicAffiliatePage({ params }: PageProps) {
  const profile = await getPublicAffiliateProfile((await params).slug);
  if (!profile) notFound();
  const campaign = `profile-${profile.slug}`;
  return (
    <main className="min-h-screen bg-[#f6f3ee]">
      <ReferralTracker sellerRef={profile.affiliateCode} source="affiliate-profile" placement="profile-view" campaign={campaign} />
      <SiteHeader sellerRef={profile.affiliateCode} />
      <section className="border-b border-black/10 bg-[#171717] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-14 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:py-20">
          <div><div className="flex items-center gap-2"><Badge className="bg-[#ff3c23]">Direct Loop Affiliate</Badge><Badge variant="outline" className="border-white/30 text-white">Level 1</Badge></div><h1 className="mt-4 text-4xl font-black sm:text-6xl">{profile.displayName}</h1><p className="mt-3 max-w-2xl text-lg text-white/70">{profile.bio || "Curated one-of-one finds from Direct Loop."}</p></div>
          <Button asChild className="bg-white text-black hover:bg-white/90"><Link href={`/?ref=${encodeURIComponent(profile.affiliateCode)}&source=affiliate-profile&placement=shop-all&campaign=${campaign}`}>Shop all products <ArrowRight /></Link></Button>
        </div>
      </section>
      <div className="mx-auto max-w-7xl space-y-12 px-5 py-10 sm:px-6">
        <section><div className="mb-5 flex items-end justify-between"><div><p className="text-sm font-semibold text-[#ff3c23]">CURATED EDITS</p><h2 className="text-3xl font-black">Collections</h2></div><FolderHeart /></div>{profile.collections.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{profile.collections.map((collection) => <Link key={collection.id} href={`/c/${collection.slug}?ref=${encodeURIComponent(profile.affiliateCode)}&source=affiliate-profile&placement=collection-card&campaign=${campaign}`} className="group overflow-hidden rounded-2xl bg-white shadow-sm"><div className="aspect-[16/10] overflow-hidden bg-[#e5dfd6]">{collection.coverImage ? <img src={collection.coverImage} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : null}</div><div className="p-5"><h3 className="text-xl font-bold">{collection.title}</h3><p className="mt-1 text-sm text-muted-foreground">{collection.itemCount} one-of-one products</p></div></Link>)}</div> : <p className="rounded-2xl bg-white p-8 text-muted-foreground">Published Collections will appear here.</p>}</section>
        {profile.products.length ? <section><div className="mb-5 flex items-end justify-between"><div><p className="text-sm font-semibold text-[#ff3c23]">LATEST FINDS</p><h2 className="text-3xl font-black">Products</h2></div><Share2 /></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{profile.products.map((product) => <AffiliatePublicProductCard key={product.id} product={product} affiliateCode={profile.affiliateCode} source="affiliate-profile" campaign={campaign} />)}</div></section> : null}
      </div>
    </main>
  );
}
