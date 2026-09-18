import sharp from "sharp";

export const dynamic = "force-dynamic";

/**
 * Product images for cards, reframed so every item sits the same size in the
 * same place.
 *
 * The display images already published were generated before the API framed
 * them: the item fills anywhere from 69% to 100% of the square, and half touch
 * an edge. Cards built from those look uneven next to each other. This trims
 * each image to the item and sets it back on white with its long side at a
 * fixed share of the square — the proportion Vestiaire's cards use. The stored
 * image is never changed; the product page still shows it as generated.
 */

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const CANVAS = 1000;
// Vestiaire's item spans about 79% of the card width; the image fills the width.
const SUBJECT_SHARE = 0.8;
// Near-white haze and the faint edge of a contact shadow do not count as the item.
const TRIM_THRESHOLD = 18;
const ALLOWED_PREFIXES = ["products/", "product-detail-assets/"];
const CACHE_LIMIT = 300;

const cache = new Map<string, Buffer>();

type RouteContext = { params: Promise<{ path?: string[] }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const source = path.join("/");
  if (!ALLOWED_PREFIXES.some((prefix) => source.startsWith(prefix)) || source.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const cached = cache.get(source);
  if (cached) return imageResponse(cached);

  const upstream = await fetch(new URL(source, API_URL.endsWith("/") ? API_URL : `${API_URL}/`), { cache: "no-store" });
  if (!upstream.ok) return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
  const original = Buffer.from(await upstream.arrayBuffer());

  let framed: Buffer;
  try {
    framed = await frame(original);
  } catch {
    // Anything sharp cannot read is shown as it was rather than not at all.
    return new Response(new Uint8Array(original), {
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "public, max-age=300" }
    });
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(source, framed);
  return imageResponse(framed);
}

async function frame(input: Buffer): Promise<Buffer> {
  const flat = await sharp(input).rotate().flatten({ background: "#ffffff" }).toBuffer();
  const trimmed = await sharp(flat)
    .trim({ background: "#ffffff", threshold: TRIM_THRESHOLD })
    .toBuffer({ resolveWithObject: true });
  const box = Math.round(CANVAS * SUBJECT_SHARE);
  const subject = await sharp(trimmed.data)
    .resize({ width: box, height: box, fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = subject.info;
  const left = Math.floor((CANVAS - width) / 2);
  const top = Math.floor((CANVAS - height) / 2);
  return sharp(subject.data)
    .extend({ left, right: CANVAS - width - left, top, bottom: CANVAS - height - top, background: "#ffffff" })
    .webp({ quality: 88 })
    .toBuffer();
}

function imageResponse(body: Buffer): Response {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      // Asset URLs change when an image is regenerated, so a day is safe.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
    }
  });
}
