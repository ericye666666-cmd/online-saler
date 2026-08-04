"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  BarChart3,
  BookImage,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Download,
  Eye,
  FolderHeart,
  LayoutDashboard,
  LoaderCircle,
  Megaphone,
  PackageCheck,
  PauseCircle,
  Plus,
  Share2,
  Trash2,
  Video,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  affiliateJson,
  type AffiliateCampaign,
  type AffiliateCollection,
  type AffiliateSessionPayload,
  useAffiliateSession,
} from "../../affiliate/affiliate-client";
import { generateStatusPack } from "../../affiliate/status-pack-generator";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Textarea } from "../../components/ui/textarea";
import { SiteHeader } from "../components/site-header";

type CenterTab = "dashboard" | "collections" | "campaigns" | "share-assets" | "analytics" | "commission";

const tabs: Array<{ id: CenterTab; label: string; icon: React.ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
  { id: "collections", label: "Collections", icon: <FolderHeart /> },
  { id: "campaigns", label: "Campaigns", icon: <Megaphone /> },
  { id: "share-assets", label: "Share Assets", icon: <BookImage /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 /> },
  { id: "commission", label: "Commission", icon: <CircleDollarSign /> },
];

export function AffiliateCenter() {
  const searchParams = useSearchParams();
  const { payload, loading, error, refresh } = useAffiliateSession();
  const requestedTab = searchParams.get("tab") as CenterTab | null;
  const [tab, setTab] = useState<CenterTab>(tabs.some((item) => item.id === requestedTab) ? requestedTab! : "dashboard");

  useEffect(() => {
    if (requestedTab && tabs.some((item) => item.id === requestedTab)) setTab(requestedTab);
  }, [requestedTab]);

  if (loading && !payload) return <CenterMessage icon={<LoaderCircle className="animate-spin" />} title="Loading Affiliate Center" body="Preparing your Collections and performance." />;
  if (error || !payload?.affiliate) return <CenterMessage icon={<Share2 />} title="Affiliate access required" body={error || "Create a Level 1 Affiliate profile before opening this page."} action={<Button asChild><Link href="/become-affiliate">Become an Affiliate</Link></Button>} />;

  return (
    <main className="min-h-screen bg-[#f6f3ee] text-[#171717]">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2"><Badge>Affiliate · Level 1</Badge><Badge variant="outline">Active</Badge></div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Affiliate Center</h1>
            <p className="mt-1 text-muted-foreground">Welcome back, {payload.affiliate.displayName}. Curate, share, and measure from one place.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href={`/seller/${payload.affiliate.slug}`} target="_blank"><Eye /> Public profile</Link></Button>
            <Button type="button" onClick={() => void copyText(publicProfileUrl(payload))}><Copy /> Copy profile link</Button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-2 shadow-sm lg:flex-col lg:self-start" aria-label="Affiliate Center">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${tab === item.id ? "bg-[#171717] text-white" : "hover:bg-muted"}`}
                onClick={() => setTab(item.id)}
              >
                {item.icon}{item.label}
              </button>
            ))}
          </nav>
          <section className="min-w-0">
            {tab === "dashboard" ? <Dashboard payload={payload} setTab={setTab} /> : null}
            {tab === "collections" ? <Collections collections={payload.collections ?? []} refresh={refresh} /> : null}
            {tab === "campaigns" ? <Campaigns campaigns={payload.campaigns ?? []} collections={payload.collections ?? []} refresh={refresh} /> : null}
            {tab === "share-assets" ? <ShareAssets payload={payload} /> : null}
            {tab === "analytics" ? <Analytics payload={payload} /> : null}
            {tab === "commission" ? <Commission payload={payload} /> : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function Dashboard({ payload, setTab }: { payload: AffiliateSessionPayload; setTab: (tab: CenterTab) => void }) {
  const metrics = payload.dashboard?.metrics;
  const statRows = [
    ["Clicks", metrics?.clicks ?? 0],
    ["Orders", metrics?.orders ?? 0],
    ["Sales", `KSh ${(metrics?.sales ?? 0).toLocaleString("en-KE")}`],
    ["Commission", `KSh ${(metrics?.commission ?? 0).toLocaleString("en-KE")}`],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statRows.map(([label, value]) => <MetricCard key={label} label={String(label)} value={String(value)} />)}</div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Start a share loop</CardTitle><CardDescription>Curate 5–30 products, publish the Collection, then share a tracked asset.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button onClick={() => setTab("collections")}><Plus /> New Collection</Button><Button variant="outline" onClick={() => setTab("share-assets")}><Share2 /> Create asset</Button></CardContent></Card>
        <Card><CardHeader><CardTitle>Top performers</CardTitle><CardDescription>Based on tracked Affiliate visits.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2"><MetricLine label="Collection" value={metrics?.topCollection || "No data yet"} /><MetricLine label="Product" value={metrics?.topProduct || "No data yet"} /></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>V1 guardrails</CardTitle><CardDescription>Sharing is manual. Direct Loop does not connect to WhatsApp, TikTok, or Facebook APIs, auto-post, or offer withdrawals in this version.</CardDescription></CardHeader></Card>
    </div>
  );
}

function Collections({ collections, refresh }: { collections: AffiliateCollection[]; refresh: () => Promise<unknown> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusyId("create");
    try {
      await affiliateJson("/api/affiliate/collections", { method: "POST", body: JSON.stringify({ title, description }) });
      setTitle(""); setDescription(""); setMessage("Collection created."); await refresh();
    } catch (caught) { setMessage(errorMessage(caught)); } finally { setBusyId(null); }
  }

  async function action(collection: AffiliateCollection, nextAction: "PUBLISH" | "ARCHIVE" | "RESTORE" | "DELETE") {
    setBusyId(collection.id); setMessage(null);
    try {
      await affiliateJson(`/api/affiliate/collections/${collection.id}`, nextAction === "DELETE"
        ? { method: "DELETE" }
        : { method: "PATCH", body: JSON.stringify({ action: nextAction }) });
      setMessage(`${collection.title} updated.`); await refresh();
    } catch (caught) { setMessage(errorMessage(caught)); } finally { setBusyId(null); }
  }

  async function rename(collection: AffiliateCollection) {
    const nextTitle = window.prompt("Collection title", collection.title)?.trim();
    if (!nextTitle || nextTitle === collection.title) return;
    setBusyId(collection.id);
    try { await affiliateJson(`/api/affiliate/collections/${collection.id}`, { method: "PATCH", body: JSON.stringify({ title: nextTitle }) }); await refresh(); }
    catch (caught) { setMessage(errorMessage(caught)); } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-5">
      <SectionHeading title="Collections" body="Create, rename, archive, publish, or delete curated groups. A public Collection needs 5–30 products." />
      <Card><CardHeader><CardTitle>New Collection</CardTitle><CardDescription>Add products later from the + button on catalog cards or the Share Sheet.</CardDescription></CardHeader><CardContent><form onSubmit={create}><FieldGroup><Field><FieldLabel htmlFor="collection-title">Title</FieldLabel><Input id="collection-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Weekend Kikuyu finds" /></Field><Field><FieldLabel htmlFor="collection-description">Description</FieldLabel><Textarea id="collection-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short reason to shop this edit." /></Field><Button type="submit" disabled={busyId === "create" || title.trim().length < 3}>{busyId === "create" ? <LoaderCircle className="animate-spin" /> : <Plus />} Create Collection</Button></FieldGroup></form></CardContent></Card>
      {message ? <p className="rounded-lg bg-white p-3 text-sm" role="status">{message}</p> : null}
      {collections.length ? <div className="grid gap-4 xl:grid-cols-2">{collections.map((collection) => (
        <Card key={collection.id}>
          {collection.coverImage ? <img src={collection.coverImage} alt="" className="h-44 w-full object-cover" /> : null}
          <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{collection.title}</CardTitle><CardDescription>{collection.description || "No description yet."}</CardDescription></div><Badge variant={collection.status === "PUBLISHED" ? "default" : "outline"}>{collection.status}</Badge></div></CardHeader>
          <CardContent><div className="flex flex-wrap gap-2 text-sm"><span>{collection.itemCount}/30 products</span><span>·</span><Link className="underline" href={`/c/${collection.slug}`} target="_blank">Public page</Link></div>{collection.itemCount < 5 ? <p className="mt-2 text-xs text-muted-foreground">Add {5 - collection.itemCount} more to publish.</p> : null}</CardContent>
          <CardFooter className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void rename(collection)}>Rename</Button>{collection.status === "PUBLISHED" ? <Button size="sm" variant="outline" onClick={() => void action(collection, "ARCHIVE")}><Archive /> Archive</Button> : <Button size="sm" onClick={() => void action(collection, collection.status === "ARCHIVED" ? "RESTORE" : "PUBLISH")} disabled={collection.status !== "ARCHIVED" && collection.itemCount < 5}>{collection.status === "ARCHIVED" ? "Restore" : "Publish"}</Button>}<Button size="sm" variant="destructive" onClick={() => window.confirm(`Delete ${collection.title}?`) && void action(collection, "DELETE")} disabled={busyId === collection.id}><Trash2 /> Delete</Button></CardFooter>
        </Card>
      ))}</div> : <EmptyState icon={<FolderHeart />} title="No Collections yet" body="Create one, then add products from the catalog." />}
    </div>
  );
}

function Campaigns({ campaigns, collections, refresh }: { campaigns: AffiliateCampaign[]; collections: AffiliateCollection[]; refresh: () => Promise<unknown> }) {
  const [title, setTitle] = useState("");
  const [collectionId, setCollectionId] = useState("none");
  const [channel, setChannel] = useState("WHATSAPP");
  const [source, setSource] = useState("whatsapp");
  const [placement, setPlacement] = useState("direct-message");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await affiliateJson("/api/affiliate/campaigns", { method: "POST", body: JSON.stringify({ title, collectionId: collectionId === "none" ? null : collectionId, channel, source, placement }) });
      setTitle(""); setMessage("Campaign created."); await refresh();
    } catch (caught) { setMessage(errorMessage(caught)); } finally { setBusy(false); }
  }

  return <div className="space-y-5"><SectionHeading title="Campaigns" body="Name tracked pushes and choose the Collection, channel, source, and placement used in every generated link." /><Card><CardHeader><CardTitle>New Campaign</CardTitle></CardHeader><CardContent><form onSubmit={create}><FieldGroup><Field><FieldLabel htmlFor="campaign-title">Campaign title</FieldLabel><Input id="campaign-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="August WhatsApp edit" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>Collection</FieldLabel><Select value={collectionId} onValueChange={setCollectionId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Storefront</SelectItem>{collections.map((collection) => <SelectItem key={collection.id} value={collection.id}>{collection.title}</SelectItem>)}</SelectContent></Select></Field><Field><FieldLabel>Channel</FieldLabel><Select value={channel} onValueChange={(value) => { setChannel(value); const defaults = campaignDefaults(value); setSource(defaults.source); setPlacement(defaults.placement); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["WHATSAPP", "STATUS", "TIKTOK", "FACEBOOK"].map((value) => <SelectItem key={value} value={value}>{titleCase(value)}</SelectItem>)}</SelectContent></Select></Field><Field><FieldLabel htmlFor="campaign-source">Source</FieldLabel><Input id="campaign-source" value={source} onChange={(event) => setSource(event.target.value)} /></Field><Field><FieldLabel htmlFor="campaign-placement">Placement</FieldLabel><Input id="campaign-placement" value={placement} onChange={(event) => setPlacement(event.target.value)} /></Field></div><Button type="submit" disabled={busy || title.trim().length < 3}>{busy ? <LoaderCircle className="animate-spin" /> : <Megaphone />} Create Campaign</Button></FieldGroup></form></CardContent></Card>{message ? <p className="rounded-lg bg-white p-3 text-sm">{message}</p> : null}{campaigns.length ? <Card><CardContent><Table><TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Collection</TableHead><TableHead>Channel</TableHead><TableHead>Tracking</TableHead><TableHead>Status</TableHead><TableHead>Link</TableHead></TableRow></TableHeader><TableBody>{campaigns.map((campaign) => <TableRow key={campaign.id}><TableCell className="font-medium">{campaign.title}</TableCell><TableCell>{campaign.collection?.title || "Storefront"}</TableCell><TableCell>{titleCase(campaign.channel)}</TableCell><TableCell>{campaign.source} / {campaign.placement}</TableCell><TableCell><Badge variant={campaign.status === "ACTIVE" ? "default" : "outline"}>{campaign.status}</Badge></TableCell><TableCell><Button size="sm" variant="outline" disabled={!campaign.link} onClick={() => campaign.link && void copyText(new URL(campaign.link, window.location.origin).toString()).then(() => setMessage(`${campaign.title} link copied.`))}><Copy /> Copy</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : <EmptyState icon={<Megaphone />} title="No Campaigns yet" body="Create one to separate performance by channel and placement." />}</div>;
}

function ShareAssets({ payload }: { payload: AffiliateSessionPayload }) {
  const collections = payload.collections ?? [];
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const [count, setCount] = useState<"4" | "6" | "8">("4");
  const [busy, setBusy] = useState<"status" | "video" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const collection = collections.find((item) => item.id === collectionId) ?? null;

  async function statusPack() {
    if (!collection || !payload.affiliate) return;
    setBusy("status"); setMessage(null);
    try {
      const blob = await generateStatusPack(collection, payload.affiliate, Number(count) as 4 | 6 | 8, window.location.origin);
      downloadBlob(blob, `direct-loop-${collection.slug}-${count}-status-pack.zip`);
      const form = new FormData(); form.set("file", blob, `status-pack-${collection.slug}-${count}.zip`); form.set("collectionId", collection.id); form.set("itemCount", count);
      void fetch("/api/affiliate/assets/status-pack", { method: "POST", body: form }).catch(() => undefined);
      setMessage(`${count}-page Status Pack downloaded.`);
    } catch (caught) { setMessage(errorMessage(caught)); } finally { setBusy(null); }
  }

  async function video() {
    if (!collection) return;
    setBusy("video"); setMessage("Rendering a 12-second MP4. This can take about a minute.");
    try {
      const response = await fetch("/api/affiliate/assets/tiktok-video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionId: collection.id }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || "Video could not be rendered."); }
      downloadBlob(await response.blob(), `direct-loop-${collection.slug}-tiktok.mp4`); setMessage("12-second TikTok MP4 downloaded.");
    } catch (caught) { setMessage(errorMessage(caught)); } finally { setBusy(null); }
  }

  return <div className="space-y-5"><SectionHeading title="Share Assets" body="Template-based output only: no AI copy, AI video, platform API, or auto-posting." />{collections.length ? <><Card><CardHeader><CardTitle>Choose a Collection</CardTitle><CardDescription>Use Collections with enough products for the selected asset.</CardDescription></CardHeader><CardContent><Select value={collectionId} onValueChange={setCollectionId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{collections.map((item) => <SelectItem key={item.id} value={item.id}>{item.title} · {item.itemCount} products</SelectItem>)}</SelectContent></Select></CardContent></Card><div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><PackageCheck /> WhatsApp Status Pack</CardTitle><CardDescription>1080×1920 PNG pages plus the tracked Collection link in one ZIP.</CardDescription></CardHeader><CardContent className="space-y-3"><Select value={count} onValueChange={(value) => setCount(value as "4" | "6" | "8")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[4, 6, 8].map((value) => <SelectItem key={value} value={String(value)}>{value} products / pages</SelectItem>)}</SelectContent></Select><Button className="w-full" onClick={() => void statusPack()} disabled={Boolean(busy) || !collection || collection.itemCount < Number(count)}>{busy === "status" ? <LoaderCircle className="animate-spin" /> : <Download />} Download ZIP</Button>{collection && collection.itemCount < Number(count) ? <p className="text-xs text-destructive">Add {Number(count) - collection.itemCount} more products first.</p> : null}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Video /> TikTok vertical video</CardTitle><CardDescription>1080×1920 MP4, 12 seconds, template transitions and tracked QR code.</CardDescription></CardHeader><CardContent><Button className="w-full" onClick={() => void video()} disabled={Boolean(busy) || !collection || collection.itemCount < 5}>{busy === "video" ? <LoaderCircle className="animate-spin" /> : <Video />} Render MP4</Button>{collection && collection.itemCount < 5 ? <p className="mt-2 text-xs text-destructive">Publish-ready videos need at least 5 products.</p> : null}</CardContent></Card></div></> : <EmptyState icon={<BookImage />} title="Create a Collection first" body="Share assets are generated from curated Collections." />}{message ? <p className="rounded-lg bg-white p-3 text-sm" role="status">{message}</p> : null}</div>;
}

function Analytics({ payload }: { payload: AffiliateSessionPayload }) {
  const metrics = payload.dashboard?.metrics;
  const rows = [
    ["Clicks", metrics?.clicks ?? 0], ["Views", metrics?.views ?? 0], ["Orders", metrics?.orders ?? 0],
    ["Sales", `KSh ${(metrics?.sales ?? 0).toLocaleString("en-KE")}`], ["Commission", `KSh ${(metrics?.commission ?? 0).toLocaleString("en-KE")}`], ["Conversion", `${(metrics?.conversionRate ?? 0).toFixed(1)}%`],
  ];
  return <div className="space-y-5"><SectionHeading title="Analytics" body="A V1 performance view from recorded Affiliate clicks and attributed orders." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(([label, value]) => <MetricCard key={label} label={String(label)} value={String(value)} />)}</div><Card><CardHeader><CardTitle>Top performance</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><MetricLine label="Top Collection" value={metrics?.topCollection || "No data yet"} /><MetricLine label="Top product" value={metrics?.topProduct || "No data yet"} /></CardContent></Card></div>;
}

function Commission({ payload }: { payload: AffiliateSessionPayload }) {
  const totals = payload.dashboard?.commission ?? {};
  const labels: Record<string, string> = { PENDING: "Pending", CONFIRMED: "Confirmed", PAID: "Paid", REJECTED: "Rejected" };
  return <div className="space-y-5"><SectionHeading title="Commission" body="Read-only commission states from attributed Direct Loop orders. Withdrawal is outside V1." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(labels).map(([status, label]) => <Card key={status}><CardHeader><CardTitle className="flex items-center gap-2">{status === "PAID" ? <CheckCircle2 /> : status === "REJECTED" ? <PauseCircle /> : <CircleDollarSign />}{label}</CardTitle></CardHeader><CardContent><strong className="text-2xl">KSh {(totals[status] ?? 0).toLocaleString("en-KE")}</strong></CardContent></Card>)}</div><Card><CardHeader><CardTitle>How it moves</CardTitle><CardDescription>Pending → Confirmed → Paid. Operations controls confirmation and payment; the Affiliate Center displays the state and does not expose a withdrawal action.</CardDescription></CardHeader></Card></div>;
}

function MetricCard({ label, value }: { label: string; value: string }) { return <Card><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>; }
function MetricLine({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted p-4"><small className="text-muted-foreground">{label}</small><strong className="mt-1 block">{value}</strong></div>; }
function SectionHeading({ title, body }: { title: string; body: string }) { return <header><h2 className="text-2xl font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{body}</p></header>; }
function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) { return <Empty className="bg-white"><EmptyHeader><EmptyMedia variant="icon">{icon}</EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{body}</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="outline"><Link href="/">Browse products</Link></Button></EmptyContent></Empty>; }
function CenterMessage({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) { return <main className="min-h-screen bg-[#f6f3ee]"><SiteHeader /><div className="mx-auto max-w-xl px-5 py-24"><Empty className="bg-white"><EmptyHeader><EmptyMedia variant="icon">{icon}</EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{body}</EmptyDescription></EmptyHeader>{action ? <EmptyContent>{action}</EmptyContent> : null}</Empty></div></main>; }
function campaignDefaults(channel: string) { if (channel === "STATUS") return { source: "whatsapp-status", placement: "status-pack" }; if (channel === "TIKTOK") return { source: "tiktok", placement: "link-in-bio" }; if (channel === "FACEBOOK") return { source: "facebook", placement: "post" }; return { source: "whatsapp", placement: "direct-message" }; }
function titleCase(value: string) { return value.toLowerCase().replace(/(^|[_-])\w/g, (match) => match.replace(/[_-]/, " ").toUpperCase()); }
function errorMessage(caught: unknown) { return caught instanceof Error ? caught.message : "Affiliate action failed."; }
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function copyText(value: string) { await navigator.clipboard.writeText(value); }
function publicProfileUrl(payload: AffiliateSessionPayload) { const path = `/seller/${payload.affiliate?.slug}`; return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString(); }
