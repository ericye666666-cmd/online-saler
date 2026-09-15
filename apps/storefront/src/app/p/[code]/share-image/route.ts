import sharp from "sharp";
import { getPublishedProduct } from "../../../../db/catalog";
import { SITE_URL } from "../../../data/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const product = await getPublishedProduct(code);
  if (!product) return new Response("Product not found", { status: 404 });
  // The image comes only from the published catalog, never a user-supplied URL.
  const source = product.image.startsWith("/api-proxy/")
    ? new URL(product.image.slice("/api-proxy".length), process.env.API_URL ?? "http://localhost:4000")
    : new URL(product.image, SITE_URL);
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Image response ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 20 * 1024 * 1024) throw new Error("Image too large");
    const jpeg = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(1200, 1200, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return new Response(new Uint8Array(jpeg), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=300, s-maxage=3600" },
    });
  } catch {
    // Do not cache a temporary upstream failure as a broken preview.
    return new Response("Product image temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
