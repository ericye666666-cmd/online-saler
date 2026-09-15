import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { seedProducts, productShareCopy, whatsappShareMessage } from "./data/products";
import { productShareMetadata } from "./product-sharing";
import { testPublicDetail } from "./storefront-products.test-fixture";
import { GET } from "./p/[code]/share-image/route";

test("personalized preview retains attribution and a public JPEG on the production domain", () => {
  const product = { ...seedProducts[0]!, size: "EU 42", price: 1250 };
  const metadata = productShareMetadata(product, "alice", "Alice");
  assert.equal(metadata.openGraph?.title, `Alice recommends ${product.title}`);
  assert.equal(metadata.description, "Size: EU 42 · Limited-time offer: KSh 1,250");
  assert.match(String(metadata.openGraph?.url), /^https:\/\/dloop.co.ke\/p\/.*\?ref=ALICE&card=/);
  assert.equal(metadata.alternates?.canonical, `/p/${product.code}`);
  assert.match(JSON.stringify(metadata.openGraph?.images), /share-image/);
  const message = whatsappShareMessage(product, "alice");
  assert.match(message, /EU 42/);
  assert.match(message, /ref=ALICE&source=whatsapp/);
  assert.doesNotMatch(productShareCopy({ ...product, status: "Sold" }).description, /Limited-time/);
  assert.match(productShareCopy(product, " ").title, /^Direct Loop recommends/);
});

test("share image serves an actual square JPEG and leaves upstream errors uncached", async () => {
  const originalFetch = globalThis.fetch;
  const source = await sharp({ create: { width: 400, height: 800, channels: 4, background: "red" } }).webp().toBuffer();
  let failImage = false;
  globalThis.fetch = async (input) => {
    if (String(input).includes("/public/products/")) return Response.json({
      id: "test", barcode: "123", brand: "Example", category: "TOP", size: "L",
      priceKsh: 1250, tags: [], images: [], measurements: [], defects: [], detail: testPublicDetail,
    });
    assert.match(String(input), /\/product-detail-assets\/detail-front\/content$/);
    return failImage ? new Response(null, { status: 500 }) : new Response(new Uint8Array(source));
  };
  try {
    const context = { params: Promise.resolve({ code: "123" }) };
    const response = await GET(new Request("https://dloop.co.ke/p/123/share-image"), context);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    const metadata = await sharp(await response.arrayBuffer()).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
    failImage = true;
    const failed = await GET(new Request("https://dloop.co.ke/p/123/share-image"), context);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("cache-control"), "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
