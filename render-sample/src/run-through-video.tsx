import { useEffect, useState } from "react";
import { runThroughSizes, type RunThroughVariant } from "../affiliate/run-through";
import { AbsoluteFill, continueRender, delayRender, Easing, Img, interpolate, Sequence, useCurrentFrame } from "remotion";

/**
 * A silent run-through ("过款") video built from the display images: a cover,
 * every piece one after another, then a short end card. Price and size sit on
 * the display image's background rather than in a panel of their own. Music
 * is added in TikTok.
 *
 * TikTok's profile grid shows only the middle 3:4 of the first frame, small.
 * Everything on the cover therefore sits inside that band: what the pieces
 * are, which sizes the video has, and pieces spanning those sizes with their
 * size and price.
 *
 * The variant (from the video's seed) sets the cover layout, background tone,
 * transition and pace, so videos made from similar pieces still differ.
 */

export type RunThroughVideoProps = {
  categoryLabel: string;
  shopUrl: string;
  variant: RunThroughVariant;
  products: Array<{ number: number; title: string; size: string; price: number; image: string }>;
};

export const RUN_THROUGH_FPS = 30;
export const RUN_THROUGH_COVER_FRAMES = 30;
export const RUN_THROUGH_END_FRAMES = 45;

export function runThroughDurationInFrames(productCount: number, itemFrames: number): number {
  return RUN_THROUGH_COVER_FRAMES + Math.max(productCount, 1) * itemFrames + RUN_THROUGH_END_FRAMES;
}

const WIDTH = 1080;
const HEIGHT = 1920;
// The part of the first frame TikTok's profile grid shows.
const SAFE_TOP = (HEIGHT - (WIDTH * 4) / 3) / 2;
const MARGIN = 90;
const INNER = WIDTH - MARGIN * 2;
const INK = "#1a1a1a";
const MUTED = "#8c8c8c";
const RULE = "rgba(0, 0, 0, 0.09)";
const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=block";
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
// Display images sit on white; multiplying them onto the tone makes that white
// take the tone, so a piece looks photographed on the video's own background.
const BLEND = { mixBlendMode: "multiply" as const };

type Product = RunThroughVideoProps["products"][number];

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

export function RunThroughVideo({ categoryLabel, shopUrl, variant, products }: RunThroughVideoProps) {
  useInterFont();
  const itemsStart = RUN_THROUGH_COVER_FRAMES;
  const endStart = itemsStart + products.length * variant.itemFrames;
  return (
    <AbsoluteFill style={{ backgroundColor: variant.tone, color: INK, fontFamily: FONT }}>
      <Sequence durationInFrames={RUN_THROUGH_COVER_FRAMES}>
        <Cover categoryLabel={categoryLabel} products={products} layout={variant.cover} />
      </Sequence>
      {products.map((product, index) => (
        <Sequence key={`${index}-${product.image}`} from={itemsStart + index * variant.itemFrames} durationInFrames={variant.itemFrames}>
          <ItemSlide product={product} total={products.length} variant={variant} />
        </Sequence>
      ))}
      <Sequence from={endStart} durationInFrames={RUN_THROUGH_END_FRAMES}>
        <EndCard count={products.length} shopUrl={shopUrl} />
      </Sequence>
    </AbsoluteFill>
  );
}

/** `count` pieces evenly spaced through the list, which runs by size, so they span the sizes. */
function spread(products: Product[], count: number): Product[] {
  if (products.length <= count) return products;
  return Array.from({ length: count }, (_, step) => products[Math.round((step * (products.length - 1)) / (count - 1))]);
}

function money(price: number) {
  return `KSh ${price.toLocaleString("en-KE")}`;
}

// The first frame is the thumbnail, so the cover is complete at frame 0 and
// never fades in.
function Cover({ categoryLabel, products, layout }: { categoryLabel: string; products: Product[]; layout: RunThroughVariant["cover"] }) {
  const sizes = runThroughSizes(products.map((product) => product.size));
  const lowest = Math.min(...products.map((product) => product.price).filter((price) => price > 0));
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, top: SAFE_TOP + 50 }}>
        <div style={{ fontSize: 24, letterSpacing: 7, color: MUTED, textTransform: "uppercase" }}>
          Direct Loop · {products.length} pieces{Number.isFinite(lowest) ? ` · from ${money(lowest)}` : ""}
        </div>
        <div style={{ fontSize: 68, fontWeight: 300, letterSpacing: -1, marginTop: 12 }}>{categoryLabel}</div>
        {sizes.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
            {sizes.map((size) => (
              <span key={size} style={{ padding: "6px 16px", border: `1.5px solid ${INK}`, fontSize: 26, fontWeight: 500, letterSpacing: 2 }}>{size}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ position: "absolute", left: MARGIN, top: SAFE_TOP + 250, width: INNER }}>
        {layout === "grid" ? <GridCover products={spread(products, 4)} /> : null}
        {layout === "hero" ? <HeroCover products={spread(products, 4)} /> : null}
        {layout === "strip" ? <StripCover products={spread(products, 3)} /> : null}
      </div>
    </AbsoluteFill>
  );
}

function TileCaption({ product, compact = false }: { product: Product; compact?: boolean }) {
  return (
    <div style={{ height: 56, display: "flex", justifyContent: "space-between", alignItems: "center", padding: compact ? "0 12px" : "0 28px", fontSize: compact ? 22 : 24, letterSpacing: compact ? 2 : 3, textTransform: "uppercase" }}>
      <span style={{ fontWeight: 500 }}>{product.size ? (compact ? product.size : `Size ${product.size}`) : ""}</span>
      <span style={{ color: MUTED }}>{compact ? product.price.toLocaleString("en-KE") : money(product.price)}</span>
    </div>
  );
}

// Four pieces, two by two.
function GridCover({ products }: { products: Product[] }) {
  const tile = INNER / 2;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      {products.map((product, index) => (
        <div key={index} style={{ boxShadow: index % 2 ? "none" : `inset -1px 0 0 ${RULE}` }}>
          <Img src={product.image} style={{ display: "block", width: tile, height: tile, objectFit: "contain", ...BLEND }} />
          <TileCaption product={product} />
        </div>
      ))}
    </div>
  );
}

// One piece large, three small beneath it.
function HeroCover({ products }: { products: Product[] }) {
  const [hero, ...rest] = products;
  const small = INNER / 3;
  return (
    <div>
      <Img src={hero.image} style={{ display: "block", width: INNER, height: 600, objectFit: "contain", ...BLEND }} />
      <TileCaption product={hero} />
      <div style={{ display: "flex", borderTop: `1px solid ${RULE}` }}>
        {rest.map((product, index) => (
          <div key={index} style={{ width: small, boxShadow: index < rest.length - 1 ? `inset -1px 0 0 ${RULE}` : "none" }}>
            <Img src={product.image} style={{ display: "block", width: small, height: small, objectFit: "contain", ...BLEND }} />
            <TileCaption product={product} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

// Three pieces as a list: picture on the left, size and price large beside it.
function StripCover({ products }: { products: Product[] }) {
  return (
    <div>
      {products.map((product, index) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: 40, height: 320, borderTop: index ? `1px solid ${RULE}` : "none" }}>
          <Img src={product.image} style={{ width: 300, height: 300, objectFit: "contain", ...BLEND }} />
          <div>
            <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: 3, textTransform: "uppercase" }}>{product.size ? `Size ${product.size}` : ""}</div>
            <div style={{ fontSize: 36, fontWeight: 300, marginTop: 10 }}>{money(product.price)}</div>
            <div style={{ fontSize: 24, color: MUTED, marginTop: 10, maxWidth: 480, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.title}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemSlide({ product, total, variant }: { product: Product; total: number; variant: RunThroughVariant }) {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const enter = variant.transition === "cut" ? 1 : interpolate(frame, [0, 7], [0, 1], { easing: EASE, ...clamp });
  const drift = interpolate(frame, [7, variant.itemFrames], [1, 1.025], clamp);
  const text = variant.transition === "cut" ? 1 : interpolate(frame, [3, 10], [0, 1], { easing: EASE, ...clamp });
  const motion = {
    slide: { opacity: enter, transform: `translateX(${(1 - enter) * 70}px) scale(${drift})` },
    fade: { opacity: enter, transform: `scale(${drift})` },
    zoom: { opacity: enter, transform: `scale(${drift * (1.12 - 0.12 * enter)})` },
    cut: { opacity: 1, transform: `scale(${drift})` },
  }[variant.transition];
  const imageTop = (HEIGHT - WIDTH) / 2;
  return (
    <AbsoluteFill>
      <Img src={product.image} style={{ position: "absolute", left: 0, top: imageTop, width: WIDTH, height: WIDTH, objectFit: "contain", ...BLEND, ...motion }} />
      <div style={{ opacity: text }}>
        <div style={{ position: "absolute", left: MARGIN, right: MARGIN, top: imageTop - 40, display: "flex", justifyContent: "space-between", fontSize: 26, letterSpacing: 4, color: MUTED, textTransform: "uppercase" }}>
          <span>No. {String(product.number).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
          <span>One of one</span>
        </div>
        <div style={{ position: "absolute", left: MARGIN, right: MARGIN, top: imageTop + WIDTH + 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 50, fontWeight: 500, letterSpacing: -0.5 }}>{money(product.price)}</span>
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
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", opacity }}>
      <div style={{ fontSize: 26, letterSpacing: 8, color: MUTED, textTransform: "uppercase" }}>Direct Loop</div>
      <div style={{ fontSize: 64, fontWeight: 300, lineHeight: 1.2, marginTop: 36 }}>{count} pieces, one of each.</div>
      <div style={{ fontSize: 30, fontWeight: 300, color: MUTED, marginTop: 28 }}>Comment the number you want · link in bio</div>
      <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: 2, marginTop: 64 }}>{shopUrl}</div>
    </AbsoluteFill>
  );
}
