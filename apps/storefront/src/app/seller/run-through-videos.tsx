"use client";

import { Copy, Download, LoaderCircle, Share2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { affiliateJson } from "../../affiliate/affiliate-client";
import type { RunThroughPlan } from "../../affiliate/run-through-service";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";

type CategoryOption = { value: string; label: string; count: number };
type Busy = "picking" | "rendering" | null;

/**
 * One button makes a TikTok run-through video: the server picks the pieces
 * shown least so far, renders them, and the affiliate downloads the MP4 and
 * copies the caption. Music is added in TikTok.
 */
export function RunThroughVideos() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [category, setCategory] = useState("ALL");
  const [busy, setBusy] = useState<Busy>(null);
  const [plan, setPlan] = useState<RunThroughPlan | null>(null);
  const [video, setVideo] = useState<{ url: string; file: File } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/affiliate/run-through-video", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ categories?: CategoryOption[] }>)
      .then((payload) => setCategories(payload.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  async function make() {
    setMessage("");
    setPlan(null);
    setVideo(null);
    try {
      setBusy("picking");
      const { plan: next } = await affiliateJson<{ plan: RunThroughPlan }>("/api/affiliate/run-through-video", { method: "POST", body: JSON.stringify({ category }) });
      setPlan(next);
      setBusy("rendering");
      const response = await fetch(`/api/affiliate/run-through-video/${next.id}`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "The video could not be made. Please try again.");
      }
      const blob = await response.blob();
      const file = new File([blob], `direct-loop-${next.id.slice(0, 8)}.mp4`, { type: "video/mp4" });
      setVideo({ url: URL.createObjectURL(blob), file });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The video could not be made. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!video) return;
    if (navigator.canShare?.({ files: [video.file] })) {
      await navigator.share({ files: [video.file] }).catch(() => undefined);
    } else {
      setMessage("Your phone cannot share the video directly. Download it, then upload it in TikTok.");
    }
  }

  async function copy(value: string, done: string) {
    await navigator.clipboard.writeText(value).then(() => setMessage(done), () => setMessage("Copy failed. Press and hold the text to copy it."));
  }

  const selected = categories.find((option) => option.value === category);
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold">TikTok video</h2>
        <p className="mt-1 text-sm text-muted-foreground">One tap makes a 12-second video of 8 pieces in stock. Each video shows different pieces, so every piece gets its turn and no two videos are the same.</p>
      </header>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <Select value={category} onValueChange={setCategory} disabled={Boolean(busy)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="New in" /></SelectTrigger>
            <SelectContent>
              {(categories.length ? categories : [{ value: "ALL", label: "New in", count: 0 }]).map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}{option.count ? ` · ${option.count} in stock` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="w-full" size="lg" onClick={() => void make()} disabled={Boolean(busy) || (categories.length > 0 && !selected)}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Video />}
            {busy === "picking" ? "Picking pieces…" : busy === "rendering" ? "Making your video (about a minute)…" : "Make my video"}
          </Button>
        </CardContent>
      </Card>

      {message ? <p className="rounded-lg bg-white p-3 text-sm" role="status">{message}</p> : null}

      {plan && video ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <video src={video.url} controls playsInline className="aspect-[9/16] w-full rounded-lg bg-black" />
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline"><a href={video.url} download={video.file.name}><Download /> Download</a></Button>
                <Button onClick={() => void share()}><Share2 /> Share</Button>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Post it in 3 steps</CardTitle>
                <CardDescription>1. Upload the video in TikTok and add a trending sound. 2. Paste this caption. 3. When someone comments a number, copy that piece&apos;s link below and reply.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea value={plan.caption} readOnly rows={4} />
                <Button variant="outline" onClick={() => void copy(plan.caption, "Caption copied.")}><Copy /> Copy caption</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Pieces in this video</CardTitle></CardHeader>
              <CardContent className="divide-y">
                {plan.items.map((item) => (
                  <div key={item.productId} className="flex items-center gap-3 py-2">
                    <span className="w-10 shrink-0 font-mono text-sm text-muted-foreground">No.{String(item.number).padStart(2, "0")}</span>
                    <img src={item.image} alt="" className="size-12 shrink-0 rounded bg-white object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">KSh {item.price.toLocaleString("en-KE")}{item.size ? ` · Size ${item.size}` : ""}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void copy(new URL(item.link, window.location.origin).toString(), `Link for No.${String(item.number).padStart(2, "0")} copied.`)}><Copy /> Link</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
