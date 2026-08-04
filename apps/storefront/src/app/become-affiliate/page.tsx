import Link from "next/link";
import { BadgeCheck, BarChart3, FolderHeart, Share2 } from "lucide-react";
import { redirect } from "next/navigation";
import { getActiveAffiliateForCustomer } from "../../affiliate/affiliate-platform-service";
import { currentCustomerSession } from "../../auth/customer-auth";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { SiteHeader } from "../components/site-header";
import { BecomeAffiliateAction } from "./become-affiliate-action";

export const dynamic = "force-dynamic";

export default async function BecomeAffiliatePage() {
  const session = await currentCustomerSession();
  if (await getActiveAffiliateForCustomer(session)) redirect("/seller");

  return (
    <main className="min-h-screen bg-[#f7f4ef] text-[#171717]">
      <SiteHeader />
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 lg:grid-cols-[1.1fr_.9fr] lg:py-24">
        <section className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#ff3c23]/10 px-3 py-1 text-sm font-medium text-[#b52313]"><Share2 size={16} /> Direct Loop Affiliate Platform</span>
          <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Curate one-of-one finds. Share them. Earn from verified sales.</h1>
          <p className="max-w-2xl text-lg leading-8 text-[#615c55]">Direct Loop keeps catalog, stock, checkout, payment, and fulfillment on the platform. You build Collections, publish tracked links, and see the commission attached to paid orders.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Feature icon={<FolderHeart />} title="Curate" body="Build publishable Collections of 5–30 products." />
            <Feature icon={<Share2 />} title="Share" body="Use WhatsApp, Status packs, cards, or TikTok video." />
            <Feature icon={<BarChart3 />} title="Measure" body="Track clicks, orders, sales, conversion, and commission." />
          </div>
        </section>
        <Card className="self-start bg-white shadow-xl">
          <CardHeader>
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#ff3c23] font-black text-white">DL</div>
            <CardTitle className="text-2xl">Start at Affiliate Level 1</CardTitle>
            <CardDescription>No application queue and no upgrade promise. Level 2 and Level 3 are reserved for future policy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {session ? (
              <BecomeAffiliateAction />
            ) : (
              <Button asChild size="lg" className="w-full"><Link href={`/login?returnTo=${encodeURIComponent("/become-affiliate")}`}>Continue with Google</Link></Button>
            )}
            <p className="flex items-start gap-2 text-sm text-muted-foreground"><BadgeCheck className="mt-0.5 shrink-0" /> Attribution and commission states are visible in Affiliate Center. Withdrawals are not part of V1.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="rounded-2xl border border-black/10 bg-white p-4"><span className="text-[#ff3c23]">{icon}</span><strong className="mt-3 block">{title}</strong><p className="mt-1 text-sm leading-6 text-[#615c55]">{body}</p></div>;
}
