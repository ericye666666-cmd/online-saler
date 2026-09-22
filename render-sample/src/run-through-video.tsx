import { AbsoluteFill, Img, interpolate, Sequence, useCurrentFrame } from "remotion";

/**
 * A silent run-through ("过款") video: a cover built from the collection, then
 * every piece one after another, then a short end card. Music is added in
 * TikTok, so nothing here carries sound.
 */

export type RunThroughVideoProps = {
  title: string;
  subtitle: string;
  shopUrl: string;
  products: Array<{ title: string; size: string; price: number; image: string }>;
};

export const RUN_THROUGH_FPS = 30;
export const RUN_THROUGH_COVER_FRAMES = 60;
export const RUN_THROUGH_ITEM_FRAMES = 40;
export const RUN_THROUGH_END_FRAMES = 60;

export function runThroughDurationInFrames(productCount: number): number {
  return RUN_THROUGH_COVER_FRAMES + Math.max(productCount, 1) * RUN_THROUGH_ITEM_FRAMES + RUN_THROUGH_END_FRAMES;
}

const INK = "#151515";
const PAPER = "#f2ece4";
const ACCENT = "#ff3c23";
const FONT = "Arial, Helvetica, sans-serif";

export function RunThroughVideo({ title, subtitle, shopUrl, products }: RunThroughVideoProps) {
  const itemsStart = RUN_THROUGH_COVER_FRAMES;
  const endStart = itemsStart + products.length * RUN_THROUGH_ITEM_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: INK, fontFamily: FONT }}>
      <Sequence durationInFrames={RUN_THROUGH_COVER_FRAMES}>
        <Cover title={title} subtitle={subtitle} products={products} />
      </Sequence>
      {products.map((product, index) => (
        <Sequence key={`${index}-${product.image}`} from={itemsStart + index * RUN_THROUGH_ITEM_FRAMES} durationInFrames={RUN_THROUGH_ITEM_FRAMES}>
          <ItemSlide product={product} index={index} total={products.length} />
        </Sequence>
      ))}
      <Sequence from={endStart} durationInFrames={RUN_THROUGH_END_FRAMES}>
        <EndCard count={products.length} shopUrl={shopUrl} />
      </Sequence>
    </AbsoluteFill>
  );
}

// The first frame is the thumbnail TikTok shows, so the cover is complete at
// frame 0 and never fades in.
function Cover({ title, subtitle, products }: Pick<RunThroughVideoProps, "title" | "subtitle" | "products">) {
  const tiles = products.slice(0, 9);
  const lowest = products.reduce((min, product) => (product.price > 0 && product.price < min ? product.price : min), Number.POSITIVE_INFINITY);
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, color: INK, padding: "110px 60px 80px" }}>
      <div style={{ color: ACCENT, fontSize: 36, fontWeight: 800, letterSpacing: 10 }}>DIRECT LOOP</div>
      <div style={{ fontSize: 128, lineHeight: 0.95, fontWeight: 900, marginTop: 28, textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 44, fontWeight: 700, marginTop: 26, color: "#4a453f" }}>
        {products.length} pieces · one of each{Number.isFinite(lowest) ? ` · from KSh ${lowest.toLocaleString("en-KE")}` : ""}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 56 }}>
        {tiles.map((product, index) => (
          <div key={index} style={{ aspectRatio: "1 / 1", overflow: "hidden", borderRadius: 18, backgroundColor: "#fff" }}>
            <Img src={product.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 38, marginTop: 40, color: "#4a453f" }}>{subtitle}</div>
    </AbsoluteFill>
  );
}

function ItemSlide({ product, index, total }: { product: RunThroughVideoProps["products"][number]; index: number; total: number }) {
  const frame = useCurrentFrame();
  // A quick snap in, like a piece being laid down, then a slow drift.
  const scale = interpolate(frame, [0, 5, RUN_THROUGH_ITEM_FRAMES], [1.08, 1, 1.03], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, color: INK }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1380, overflow: "hidden" }}>
        <Img src={product.image} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
      </div>
      <div style={{ position: "absolute", top: 70, left: 60, padding: "14px 26px", borderRadius: 999, backgroundColor: INK, color: "#fff", fontSize: 40, fontWeight: 800 }}>
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1380, bottom: 0, padding: "46px 60px", backgroundColor: PAPER }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ fontSize: 104, fontWeight: 900, lineHeight: 1 }}>KSh {product.price.toLocaleString("en-KE")}</div>
          <div style={{ marginLeft: "auto", padding: "12px 30px", borderRadius: 16, backgroundColor: ACCENT, color: "#fff", fontSize: 64, fontWeight: 900 }}>{product.size}</div>
        </div>
        <div style={{ fontSize: 46, fontWeight: 700, marginTop: 30, color: "#4a453f", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.title}</div>
        <div style={{ fontSize: 32, marginTop: 18, color: "#8a8279" }}>Only one · first to buy gets it</div>
      </div>
    </AbsoluteFill>
  );
}

function EndCard({ count, shopUrl }: { count: number; shopUrl: string }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: INK, color: "#fff", justifyContent: "center", padding: 90, opacity }}>
      <div style={{ color: ACCENT, fontSize: 40, fontWeight: 800, letterSpacing: 10 }}>DIRECT LOOP</div>
      <div style={{ fontSize: 110, lineHeight: 1, fontWeight: 900, marginTop: 40 }}>{count} pieces.<br />One of each.</div>
      <div style={{ fontSize: 48, marginTop: 50, color: "#d3cbc2" }}>Tell us the number you want</div>
      <div style={{ fontSize: 56, fontWeight: 800, marginTop: 70 }}>{shopUrl}</div>
    </AbsoluteFill>
  );
}
