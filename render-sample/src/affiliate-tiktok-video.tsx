import { AbsoluteFill, Img, interpolate, Sequence, useCurrentFrame } from "remotion";

export type AffiliateTikTokVideoProps = {
  affiliateName: string;
  collectionTitle: string;
  qrDataUrl: string;
  products: Array<{ code: string; title: string; size: string; price: number; image: string }>;
};

export function AffiliateTikTokVideo({ affiliateName, collectionTitle, qrDataUrl, products }: AffiliateTikTokVideoProps) {
  const frame = useCurrentFrame();
  const introOpacity = interpolate(frame, [0, 12, 65, 78], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const productFrames = 48;
  const productStart = 65;
  const visibleProducts = products.slice(0, 5);
  return (
    <AbsoluteFill style={{ backgroundColor: "#151515", color: "#fff", fontFamily: "Arial, sans-serif" }}>
      <AbsoluteFill style={{ opacity: introOpacity, justifyContent: "center", padding: 90 }}>
        <div style={{ color: "#ff3c23", fontSize: 42, fontWeight: 800, letterSpacing: 8 }}>DIRECT LOOP</div>
        <div style={{ fontSize: 98, lineHeight: 1.02, fontWeight: 900, marginTop: 38 }}>{collectionTitle}</div>
        <div style={{ fontSize: 38, color: "#c8c0b7", marginTop: 44 }}>Curated by {affiliateName}</div>
      </AbsoluteFill>
      {visibleProducts.map((product, index) => (
        <Sequence key={product.code} from={productStart + index * productFrames} durationInFrames={productFrames + 12}>
          <ProductSlide product={product} index={index} />
        </Sequence>
      ))}
      <Sequence from={300} durationInFrames={60}>
        <AbsoluteFill style={{ backgroundColor: "#f2ece4", color: "#151515", justifyContent: "center", alignItems: "center", textAlign: "center", padding: 90 }}>
          <Img src={qrDataUrl} style={{ width: 420, height: 420, borderRadius: 24 }} />
          <div style={{ fontSize: 76, lineHeight: 1.04, fontWeight: 900, marginTop: 46 }}>Scan to shop<br />the Collection</div>
          <div style={{ fontSize: 34, marginTop: 32, color: "#625c54" }}>One-of-one finds · Direct Loop</div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}

function ProductSlide({ product, index }: { product: AffiliateTikTokVideoProps["products"][number]; index: number }) {
  const frame = useCurrentFrame();
  const translate = interpolate(frame, [0, 12, 48, 60], [120, 0, 0, -90], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = interpolate(frame, [0, 8, 50, 60], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, 60], [1.04, 1.14], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity, transform: `translateY(${translate}px)` }}>
      <Img src={product.image} style={{ width: "100%", height: "72%", objectFit: "cover", transform: `scale(${scale})` }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "36%", padding: "110px 78px 70px", background: "linear-gradient(transparent, #151515 28%)" }}>
        <div style={{ color: "#ff3c23", fontSize: 32, fontWeight: 800 }}>FIND {String(index + 1).padStart(2, "0")}</div>
        <div style={{ fontSize: 70, lineHeight: 1.03, fontWeight: 900, marginTop: 20 }}>{product.title}</div>
        <div style={{ fontSize: 38, marginTop: 30, color: "#d3cbc2" }}>Size {product.size} · KSh {product.price.toLocaleString("en-KE")}</div>
      </div>
    </AbsoluteFill>
  );
}
