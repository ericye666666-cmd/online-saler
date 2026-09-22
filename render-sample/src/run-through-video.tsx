import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, Img, interpolate, Sequence, useCurrentFrame } from "remotion";

/**
 * A silent run-through ("过款") video built from the display images: a cover,
 * every piece one after another, then a short end card. Price and size sit on
 * the white of the display image rather than in a panel of their own. Music
 * is added in TikTok.
 *
 * TikTok's profile grid shows only the middle 3:4 of the first frame, small.
 * Everything on the cover therefore sits inside that band, and the cover shows
 * four pieces large rather than many small.
 */

export type RunThroughVideoProps = {
  categoryLabel: string;
  shopUrl: string;
  products: Array<{ number: number; title: string; size: string; price: number; image: string }>;
};

export const RUN_THROUGH_FPS = 30;
export const RUN_THROUGH_COVER_FRAMES = 30;
export const RUN_THROUGH_ITEM_FRAMES = 36;
export const RUN_THROUGH_END_FRAMES = 45;

export function runThroughDurationInFrames(productCount: number): number {
  return RUN_THROUGH_COVER_FRAMES + Math.max(productCount, 1) * RUN_THROUGH_ITEM_FRAMES + RUN_THROUGH_END_FRAMES;
}

const WIDTH = 1080;
const HEIGHT = 1920;
// The part of the first frame TikTok's profile grid shows.
const SAFE_TOP = (HEIGHT - (WIDTH * 4) / 3) / 2;
const INK = "#1a1a1a";
const MUTED = "#8c8c8c";
const RULE = "#e8e8e8";
const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=block";
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

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

export function RunThroughVideo({ categoryLabel, shopUrl, products }: RunThroughVideoProps) {
  useInterFont();
  const itemsStart = RUN_THROUGH_COVER_FRAMES;
  const endStart = itemsStart + products.length * RUN_THROUGH_ITEM_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff", color: INK, fontFamily: FONT }}>
      <Sequence durationInFrames={RUN_THROUGH_COVER_FRAMES}>
        <Cover categoryLabel={categoryLabel} products={products} />
      </Sequence>
      {products.map((product, index) => (
        <Sequence key={`${index}-${product.image}`} from={itemsStart + index * RUN_THROUGH_ITEM_FRAMES} durationInFrames={RUN_THROUGH_ITEM_FRAMES}>
          <ItemSlide product={product} total={products.length} />
        </Sequence>
      ))}
      <Sequence from={endStart} durationInFrames={RUN_THROUGH_END_FRAMES}>
        <EndCard count={products.length} shopUrl={shopUrl} />
      </Sequence>
    </AbsoluteFill>
  );
}

// The first frame is the thumbnail, so the cover is complete at frame 0 and
// never fades in.
function Cover({ categoryLabel, products }: Pick<RunThroughVideoProps, "categoryLabel" | "products">) {
  const tiles = products.slice(0, 4);
  const tile = 480;
  const gridLeft = (WIDTH - tile * 2) / 2;
  const gridTop = SAFE_TOP + 190;
  const lowest = Math.min(...products.map((product) => product.price).filter((price) => price > 0));
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff" }}>
      <div style={{ position: "absolute", left: gridLeft, right: gridLeft, top: SAFE_TOP + 60 }}>
        <div style={{ fontSize: 24, letterSpacing: 7, color: MUTED, textTransform: "uppercase" }}>Direct Loop · {products.length} pieces</div>
        <div style={{ fontSize: 64, fontWeight: 300, letterSpacing: -1, marginTop: 14 }}>{categoryLabel}</div>
      </div>
      {tiles.map((product, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: gridLeft + (index % 2) * tile,
            top: gridTop + Math.floor(index / 2) * tile,
            width: tile,
            height: tile,
            boxShadow: `inset ${index % 2 ? 0 : -1}px ${index < 2 ? -1 : 0}px 0 ${RULE}`,
          }}
        >
          <Img src={product.image} style={{ width: tile, height: tile, objectFit: "contain" }} />
        </div>
      ))}
      <div style={{ position: "absolute", left: gridLeft, right: gridLeft, top: gridTop + tile * 2 + 36, display: "flex", justifyContent: "space-between", fontSize: 26, letterSpacing: 4, color: MUTED, textTransform: "uppercase" }}>
        <span>One of each</span>
        {Number.isFinite(lowest) ? <span>From KSh {lowest.toLocaleString("en-KE")}</span> : null}
      </div>
    </AbsoluteFill>
  );
}

function ItemSlide({ product, total }: { product: RunThroughVideoProps["products"][number]; total: number }) {
  const frame = useCurrentFrame();
  // Each piece slides in and settles, then drifts slowly until the next.
  const enter = interpolate(frame, [0, 7], [0, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drift = interpolate(frame, [7, RUN_THROUGH_ITEM_FRAMES], [1, 1.025], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const text = interpolate(frame, [3, 10], [0, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const imageTop = (HEIGHT - WIDTH) / 2;
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff" }}>
      <Img
        src={product.image}
        style={{ position: "absolute", left: 0, top: imageTop, width: WIDTH, height: WIDTH, objectFit: "contain", opacity: enter, transform: `translateX(${(1 - enter) * 70}px) scale(${drift})` }}
      />
      <div style={{ opacity: text }}>
        <div style={{ position: "absolute", left: 90, right: 90, top: imageTop - 40, display: "flex", justifyContent: "space-between", fontSize: 26, letterSpacing: 4, color: MUTED, textTransform: "uppercase" }}>
          <span>No. {String(product.number).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
          <span>One of one</span>
        </div>
        <div style={{ position: "absolute", left: 90, right: 90, top: imageTop + WIDTH + 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 50, fontWeight: 500, letterSpacing: -0.5 }}>KSh {product.price.toLocaleString("en-KE")}</span>
            {product.size ? <span style={{ fontSize: 30, letterSpacing: 4, textTransform: "uppercase" }}>Size {product.size}</span> : null}
          </div>
          <div style={{ marginTop: 14, fontSize: 28, fontWeight: 300, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.title}</div>
        </div>
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
      <div style={{ fontSize: 30, fontWeight: 300, color: MUTED, marginTop: 28 }}>Comment the number you want · link in bio</div>
      <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: 2, marginTop: 64 }}>{shopUrl}</div>
    </AbsoluteFill>
  );
}
