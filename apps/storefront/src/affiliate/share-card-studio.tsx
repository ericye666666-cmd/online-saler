"use client";

import { Download, LoaderCircle } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import type { Product } from "../app/data/products";
import { Button } from "../components/ui/button";

const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 0.5;

export function ShareCardStudio({
  product,
  shareUrl,
  affiliateName,
  onDownloaded,
}: {
  product: Product;
  shareUrl: string;
  affiliateName: string;
  onDownloaded?: (blob: Blob) => void | Promise<void>;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const [productImage, setProductImage] = useState<HTMLImageElement | null>(null);
  const [qrImage, setQrImage] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let productObjectUrl = "";
    let active = true;
    async function load() {
      const [productResponse, qrDataUrl] = await Promise.all([
        fetch(product.image),
        QRCode.toDataURL(shareUrl, { width: 260, margin: 1, color: { dark: "#101010", light: "#ffffff" } }),
      ]);
      const blob = await productResponse.blob();
      productObjectUrl = URL.createObjectURL(blob);
      const [nextProduct, nextQr] = await Promise.all([loadImage(productObjectUrl), loadImage(qrDataUrl)]);
      if (active) {
        setProductImage(nextProduct);
        setQrImage(nextQr);
      }
    }
    void load().catch(() => undefined);
    return () => {
      active = false;
      if (productObjectUrl) URL.revokeObjectURL(productObjectUrl);
    };
  }, [product.image, shareUrl]);

  async function download() {
    const stage = stageRef.current;
    if (!stage || !productImage || !qrImage) return;
    setBusy(true);
    try {
      const canvas = stage.toCanvas({ pixelRatio: 2 });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Share Card could not be encoded.")), "image/png"));
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = `direct-loop-${product.code}-share-card.png`;
      anchor.href = objectUrl;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      await onDownloaded?.(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm" aria-label="1200 by 630 share card preview">
        <Stage ref={stageRef} width={WIDTH * SCALE} height={HEIGHT * SCALE} scaleX={SCALE} scaleY={SCALE}>
          <Layer>
            <Rect width={WIDTH} height={HEIGHT} fill="#f4efea" />
            <Rect x={32} y={32} width={566} height={566} cornerRadius={28} fill="#ded7ce" />
            {productImage ? (
              <KonvaImage
                image={productImage}
                x={32}
                y={32}
                width={566}
                height={566}
                cornerRadius={28}
                crop={coverCrop(productImage, 566, 566)}
              />
            ) : null}
            <Text x={650} y={62} width={450} text="DIRECT LOOP" fontSize={28} fontStyle="bold" fill="#ff3c23" letterSpacing={4} />
            <Text x={650} y={138} width={470} text={product.title} fontSize={48} lineHeight={1.08} fontStyle="bold" fill="#151515" />
            <Text x={650} y={302} width={430} text={`Size ${product.size}  ·  ${product.condition}`} fontSize={25} fill="#5d5851" />
            <Text x={650} y={350} width={300} text={`KSh ${product.price.toLocaleString("en-KE")}`} fontSize={39} fontStyle="bold" fill="#151515" />
            {qrImage ? <KonvaImage image={qrImage} x={934} y={382} width={190} height={190} /> : null}
            <Text x={650} y={442} width={250} text={`Shared by\n${affiliateName}`} fontSize={23} lineHeight={1.3} fill="#5d5851" />
            <Text x={650} y={548} width={260} text="Scan to shop" fontSize={20} fontStyle="bold" fill="#151515" />
          </Layer>
        </Stage>
      </div>
      <Button type="button" onClick={() => void download()} disabled={!productImage || !qrImage || busy} className="w-full">
        {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
        Download PNG · 1200×630
      </Button>
    </div>
  );
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function coverCrop(image: HTMLImageElement, width: number, height: number) {
  const ratio = Math.max(width / image.width, height / image.height);
  const cropWidth = width / ratio;
  const cropHeight = height / ratio;
  return {
    x: Math.max(0, (image.width - cropWidth) / 2),
    y: Math.max(0, (image.height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}
