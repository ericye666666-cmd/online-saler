import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Img, interpolate, Sequence, useCurrentFrame } from "remotion";

/**
 * A silent run-through ("过款") video built from the display images: a cover
 * that is only the pieces themselves, then every piece one after another, then
 * a short end card. The price and size sit on the white of the display image
 * rather than in a panel of their own. Music is added in TikTok.
 */

export type RunThroughVideoProps = {
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

const WIDTH = 1080;
const HEIGHT = 1920;
const INK = "#1a1a1a";
const MUTED = "#8c8c8c";
const RULE = "#e8e8e8";
const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=block";

// The cover is a ruled grid of three columns; five rows fill the frame.
const COVER_COLUMNS = 3;
const COVER_ROWS = 5;

function useInterFont() {
  const [handle] = useState(() => delayRender("Loading Inter"));
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_CSS;
    link.onload = () => {
      void Promise.all(["300", "400", "500"].map((weight) => document.fonts.load(`${weight} 40px Inter`)))
        .finally(() => continueRender(handle));
    };
    // Without the font the video still renders, in the fallback face.
    link.onerror = () => continueRender(handle);
    document.head.appendChild(link);
  }, [handle]);
}

export function RunThroughVideo({ shopUrl, products }: RunThroughVideoProps) {
  useInterFont();
  const itemsStart = RUN_THROUGH_COVER_FRAMES;
  const endStart = itemsStart + products.length * RUN_THROUGH_ITEM_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff", color: INK, fontFamily: FONT }}>
      <Sequence durationInFrames={RUN_THROUGH_COVER_FRAMES}>
        <Cover products={products} />
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
function Cover({ products }: Pick<RunThroughVideoProps, "products">) {
  const tiles = products.slice(0, COVER_COLUMNS * COVER_ROWS);
  const tileWidth = WIDTH / COVER_COLUMNS;
  const tileHeight = HEIGHT / COVER_ROWS;
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff" }}>
      {tiles.map((product, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: (index % COVER_COLUMNS) * tileWidth,
            top: Math.floor(index / COVER_COLUMNS) * tileHeight,
            width: tileWidth,
            height: tileHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `inset -1px -1px 0 ${RULE}`,
          }}
        >
          <Img src={product.image} style={{ width: tileWidth, height: tileWidth, objectFit: "contain" }} />
        </div>
      ))}
    </AbsoluteFill>
  );
}

function ItemSlide({ product, index, total }: { product: RunThroughVideoProps["products"][number]; index: number; total: number }) {
  const frame = useCurrentFrame();
  // A quick settle, like a piece being laid down, then a slow drift.
  const scale = interpolate(frame, [0, 6, RUN_THROUGH_ITEM_FRAMES], [1.05, 1, 1.02], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const imageTop = (HEIGHT - WIDTH) / 2;
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff" }}>
      <Img src={product.image} style={{ position: "absolute", left: 0, top: imageTop, width: WIDTH, height: WIDTH, objectFit: "contain", transform: `scale(${scale})` }} />
      <div style={{ position: "absolute", left: 90, right: 90, top: imageTop - 40, display: "flex", justifyContent: "space-between", fontSize: 26, fontWeight: 400, letterSpacing: 4, color: MUTED, textTransform: "uppercase" }}>
        <span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        <span>One of one</span>
      </div>
      <div style={{ position: "absolute", left: 90, right: 90, top: imageTop + WIDTH + 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 50, fontWeight: 500, letterSpacing: -0.5 }}>KSh {product.price.toLocaleString("en-KE")}</span>
          <span style={{ fontSize: 30, fontWeight: 400, letterSpacing: 4, textTransform: "uppercase" }}>Size {product.size}</span>
        </div>
        <div style={{ marginTop: 14, fontSize: 28, fontWeight: 300, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.title}</div>
      </div>
    </AbsoluteFill>
  );
}

function EndCard({ count, shopUrl }: { count: number; shopUrl: string }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff", justifyContent: "center", alignItems: "center", textAlign: "center", opacity }}>
      <div style={{ fontSize: 26, letterSpacing: 8, color: MUTED, textTransform: "uppercase" }}>Direct Loop</div>
      <div style={{ fontSize: 64, fontWeight: 300, lineHeight: 1.2, marginTop: 36 }}>{count} pieces, one of each.</div>
      <div style={{ fontSize: 30, fontWeight: 300, color: MUTED, marginTop: 28 }}>Tell us the number you want</div>
      <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: 2, marginTop: 64 }}>{shopUrl}</div>
    </AbsoluteFill>
  );
}
