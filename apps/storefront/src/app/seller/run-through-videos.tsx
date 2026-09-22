"use client";

import { CheckCircle2, Copy, Download, LoaderCircle, RotateCcw, Share2, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { affiliateJson } from "../../affiliate/affiliate-client";
import type { RunThroughPlan } from "../../affiliate/run-through-service";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";

type CategoryOption = { value: string; label: string; count: number };
type Listing = { videos: RunThroughPlan[]; categories: CategoryOption[] };

// While any of today's videos is still being made, check back this often.
const REFRESH_MS = 30_000;

/**
 * Today's TikTok videos, made overnight: three a day, each a different
 * category and a different look. The affiliate downloads each, posts it with
 * a trending sound, and pastes the caption. An extra video of any category can
 * be made on the spot. Music is added in TikTok.
 */
export function RunThroughVideos() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/affiliate/run-through-video", { cache: "no-store" });
      const payload = await response.json() as Listing & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Today's videos could not be loaded.");
      setListing(payload);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Today's videos could not be loaded.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const waiting = listing?.videos.some((video) => !video.stored && video.status === "PROCESSING");
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  const videos = listing?.videos ?? [];
  const downloaded = videos.filter((video) => video.downloaded).length;
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold">TikTok videos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Post today&apos;s {videos.length || 3} videos. Each is a different category with its own look, made just for you, so none of them matches anyone else&apos;s.</p>
      </header>

      {error ? <p className="rounded-lg bg-white p-3 text-sm text-destructive" role="alert">{error}</p> : null}
      {!listing && !error ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading today&apos;s videos…</p> : null}

      {videos.length ? (
        <>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant={downloaded >= videos.length ? "default" : "outline"}>{downloaded} of {videos.length} downloaded today</Badge>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {videos.map((video) => <VideoCard key={video.id} plan={video} title={`Video ${video.slot}`} onChanged={load} />)}
          </div>
        </>
      ) : listing ? (
        <p className="rounded-lg bg-white p-4 text-sm text-muted-foreground">No videos today: there are not enough pieces in stock yet.</p>
      ) : null}

      {listing?.categories.length ? <ExtraVideo categories={listing.categories} /> : null}
    </div>
  );
}

function VideoCard({ plan, title, onChanged, initialBlobUrl }: { plan: RunThroughPlan; title: string; onChanged?: () => Promise<void> | void; initialBlobUrl?: string }) {
  const [making, setMaking] = useState(false);
  const [blobUrl, setBlobUrl] = useState(initialBlobUrl ?? "");
  const [message, setMessage] = useState("");
  const [stored, setStored] = useState(plan.stored);
  const fileUrl = `/api/affiliate/run-through-video/${plan.id}/file`;
  const source = stored ? fileUrl : blobUrl;
  const seconds = Math.round((30 + plan.items.length * plan.variant.itemFrames + 45) / 30);

  useEffect(() => setStored(plan.stored), [plan.stored]);

  async function makeNow() {
    setMaking(true);
    setMessage("");
    try {
      const response = await fetch(`/api/affiliate/run-through-video/${plan.id}`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "The video could not be made. Please try again.");
      }
      if (response.headers.get("content-type")?.includes("video/mp4")) {
        setBlobUrl(URL.createObjectURL(await response.blob()));
      } else {
        setStored(true);
      }
      await onChanged?.();
    } catch (makeError) {
      setMessage(makeError instanceof Error ? makeError.message : "The video could not be made. Please try again.");
    } finally {
      setMaking(false);
    }
  }

  async function share() {
    try {
      const blob = await (await fetch(stored ? `${fileUrl}?download=1` : blobUrl)).blob();
      const file = new File([blob], `direct-loop-${plan.id.slice(0, 8)}.mp4`, { type: "video/mp4" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        await onChanged?.();
      } else {
        setMessage("Your phone cannot share the video directly. Download it, then upload it in TikTok.");
      }
    } catch {
      // The share sheet was closed.
    }
  }

  async function copy(value: string, done: string) {
    await navigator.clipboard.writeText(value).then(() => setMessage(done), () => setMessage("Copy failed. Press and hold the text to copy it."));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{title} · {plan.categoryLabel}</span>
          {plan.downloaded ? <Badge variant="outline" className="gap-1"><CheckCircle2 className="size-3" /> Downloaded</Badge> : null}
        </CardTitle>
        <CardDescription>{plan.items.length} pieces · {seconds} seconds</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {source ? (
          <>
            <video src={source} controls playsInline preload="metadata" className="aspect-[9/16] w-full rounded-lg bg-black" />
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <a href={stored ? `${fileUrl}?download=1` : blobUrl} download={`direct-loop-${plan.id.slice(0, 8)}.mp4`} onClick={() => window.setTimeout(() => void onChanged?.(), 1500)}><Download /> Download</a>
              </Button>
              <Button onClick={() => void share()}><Share2 /> Share</Button>
            </div>
          </>
        ) : (
          <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">
            {making ? <LoaderCircle className="size-6 animate-spin" /> : <Video className="size-6" />}
            <p>{making ? "Making your video (about a minute)…" : plan.status === "FAILED" ? "This video could not be made." : "Your video is being made and will appear here."}</p>
            <Button size="sm" variant="outline" disabled={making} onClick={() => void makeNow()}>
              {plan.status === "FAILED" ? <RotateCcw /> : <Video />} {plan.status === "FAILED" ? "Try again" : "Make it now"}
            </Button>
          </div>
        )}

        <Textarea value={plan.caption} readOnly rows={4} className="text-xs" />
        <Button variant="outline" className="w-full" onClick={() => void copy(plan.caption, "Caption copied.")}><Copy /> Copy caption</Button>

        <details className="rounded-lg border bg-white">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Piece links, for replying to comments</summary>
          <div className="divide-y">
            {plan.items.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 px-3 py-2">
                <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">No.{String(item.number).padStart(2, "0")}</span>
                <img src={item.image} alt="" className="size-10 shrink-0 rounded bg-white object-contain" />
                <p className="min-w-0 flex-1 truncate text-xs">{item.size ? `Size ${item.size} · ` : ""}KSh {item.price.toLocaleString("en-KE")}</p>
                <Button size="sm" variant="ghost" onClick={() => void copy(new URL(item.link, window.location.origin).toString(), `Link for No.${String(item.number).padStart(2, "0")} copied.`)}><Copy /></Button>
              </div>
            ))}
          </div>
        </details>

        {message ? <p className="text-sm" role="status">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

function ExtraVideo({ categories }: { categories: CategoryOption[] }) {
  const [category, setCategory] = useState(categories[0]?.value ?? "");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<RunThroughPlan | null>(null);
  const [message, setMessage] = useState("");

  async function make() {
    setBusy(true);
    setMessage("");
    setPlan(null);
    try {
      const { plan: next } = await affiliateJson<{ plan: RunThroughPlan }>("/api/affiliate/run-through-video", { method: "POST", body: JSON.stringify({ category }) });
      setPlan(next);
    } catch (makeError) {
      setMessage(makeError instanceof Error ? makeError.message : "The video could not be made. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Want to post more?</CardTitle>
        <CardDescription>Make an extra video of any category. It gets its own pieces and look, like the daily ones.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={category} onValueChange={setCategory} disabled={busy}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Choose a category" /></SelectTrigger>
          <SelectContent>
            {categories.map((option) => <SelectItem key={option.value} value={option.value}>{option.label} · {option.count} in stock</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="w-full" onClick={() => void make()} disabled={busy || !category}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Video />} {busy ? "Picking pieces…" : "Pick pieces for an extra video"}
        </Button>
        {message ? <p className="text-sm text-destructive" role="alert">{message}</p> : null}
        {plan ? <div className="max-w-sm"><VideoCard plan={plan} title="Extra video" /></div> : null}
      </CardContent>
    </Card>
  );
}
