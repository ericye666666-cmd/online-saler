import JSZip from "jszip";
import QRCode from "qrcode";
import type { AffiliateCollection, AffiliateIdentity, AffiliateProduct } from "./affiliate-client";

const WIDTH = 1080;
const HEIGHT = 1920;

export async function generateStatusPack(
  collection: AffiliateCollection,
  affiliate: AffiliateIdentity,
  pageCount: 4 | 6 | 8,
  origin: string,
) {
  if (collection.products.length < pageCount) {
    throw new Error(`${collection.title} needs at least ${pageCount} products for this pack.`);
  }
  const campaign = `status-pack-${collection.slug}`;
  const collectionUrl = new URL(`/c/${collection.slug}`, origin);
  collectionUrl.searchParams.set("ref", affiliate.affiliateCode);
  collectionUrl.searchParams.set("source", "whatsapp-status");
  collectionUrl.searchParams.set("placement", "status-pack");
  collectionUrl.searchParams.set("campaign", campaign);
  const qrDataUrl = await QRCode.toDataURL(collectionUrl.toString(), { width: 340, margin: 1 });
  const qr = await loadImage(qrDataUrl);
  const zip = new JSZip();

  for (let index = 0; index < pageCount; index += 1) {
    const product = collection.products[index];
    const blob = await renderStatusPage(product, collection, affiliate, qr, index, pageCount);
    zip.file(`${String(index + 1).padStart(2, "0")}-${product.code}.png`, blob);
  }
  zip.file("README.txt", [
    `Direct Loop Status Pack: ${collection.title}`,
    `${pageCount} pages · 1080×1920 PNG`,
    `Tracked collection link: ${collectionUrl.toString()}`,
    "Post manually. No WhatsApp API or auto-posting is used.",
  ].join("\n"));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

async function renderStatusPage(
  product: AffiliateProduct,
  collection: AffiliateCollection,
  affiliate: AffiliateIdentity,
  qr: HTMLImageElement,
  index: number,
  pageCount: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available in this browser.");
  const image = await fetchImage(product.image);
  context.fillStyle = index % 2 === 0 ? "#f2ece4" : "#151515";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawCover(context, image, 64, 180, 952, 1070);
  context.fillStyle = "#ff3c23";
  context.font = "700 34px Arial";
  context.letterSpacing = "5px";
  context.fillText("DIRECT LOOP", 64, 92);
  context.fillStyle = index % 2 === 0 ? "#151515" : "#ffffff";
  context.font = "800 64px Arial";
  wrapText(context, product.title, 64, 1350, 760, 76, 3);
  context.font = "600 38px Arial";
  context.fillText(`Size ${product.size}  ·  KSh ${product.price.toLocaleString("en-KE")}`, 64, 1590);
  context.font = "400 28px Arial";
  context.fillStyle = index % 2 === 0 ? "#5d5851" : "#cfc8bf";
  context.fillText(`${collection.title} · ${index + 1}/${pageCount}`, 64, 1662);
  context.drawImage(qr, 790, 1570, 220, 220);
  context.fillStyle = index % 2 === 0 ? "#151515" : "#ffffff";
  context.font = "600 25px Arial";
  context.fillText(index === pageCount - 1 ? "Scan to shop the Collection" : `Curated by ${affiliate.displayName}`, 64, 1780);
  return canvasBlob(canvas);
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.save();
  roundedRect(context, x, y, width, height, 42);
  context.clip();
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  context.restore();
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function wrapText(context: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = value.split(/\s+/);
  let line = "";
  let lineIndex = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      line = word;
      lineIndex += 1;
      if (lineIndex >= maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (lineIndex < maxLines) context.fillText(line, x, y + lineIndex * lineHeight);
}

async function fetchImage(source: string) {
  const response = await fetch(source);
  if (!response.ok) throw new Error("A product image could not be loaded.");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    return await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Status page could not be encoded.")), "image/png"));
}
