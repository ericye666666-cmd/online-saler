import React, { type ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { DELIVERY_FRAMES, DeliveryScene } from "./delivery-scene";
import { ACCENT, GREEN, INK, MUTED, Sfx, useIn } from "./shared";

// "Good to know" cards shown after the buying steps: deposit hold, pickup,
// delivery and returns. Shared by both how-to-buy videos.

const CARD_FRAMES = 90;

const icons: Record<string, ReactNode> = {
  lock: <g><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></g>,
  store: <g><path d="M4 10h16v10H4z" /><path d="M3 10l2-5h14l2 5" /><path d="M10 20v-5h4v5" /></g>,
  back: <g><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></g>
};

function InfoLayout({ icon, kicker, title, children }: { icon: keyof typeof icons; kicker: string; title: string; children: ReactNode }) {
  const a = useIn(0, 12);
  const b = useIn(6);
  return (
    <AbsoluteFill style={{ alignItems: "center", textAlign: "center", paddingTop: 230 }}>
      <div style={{ width: 170, height: 170, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${a})` }}>
        <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[icon]}</svg>
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color: ACCENT, marginTop: 34, letterSpacing: 3, opacity: b }}>{kicker.toUpperCase()}</div>
      <div style={{ fontSize: 88, fontWeight: 800, marginTop: 12, letterSpacing: -1.5, lineHeight: 1.05, padding: "0 70px", opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>{title}</div>
      <div style={{ marginTop: 70, width: 940, display: "flex", flexDirection: "column", gap: 32, textAlign: "left" }}>{children}</div>
    </AbsoluteFill>
  );
}

function Point({ at, children, tone = INK }: { at: number; children: ReactNode; tone?: string }) {
  const s = useIn(at);
  return (
    <div style={{
      background: "white", borderRadius: 26, padding: "38px 42px", fontSize: 47, fontWeight: 600, lineHeight: 1.3, color: tone,
      boxShadow: "0 12px 30px rgba(31,27,24,0.08)", opacity: s, transform: `translateX(${(1 - s) * 300}px)`
    }}>{children}</div>
  );
}

const B = ({ children }: { children: ReactNode }) => <b style={{ fontWeight: 800 }}>{children}</b>;

export function DepositInfo() {
  return (
    <InfoLayout icon="lock" kicker="Not ready to pay it all?" title="Pay 50% to hold it">
      <Point at={8}>Pay <B>half now</B>. We <B>hold the piece for 7 days</B>.</Point>
      <Point at={20}>Pay the rest from <B>your order page</B> within the 7 days.</Point>
      <Point at={32} tone={MUTED}>Too late? It goes back on sale and you get <B>30% of the price</B> back.</Point>
    </InfoLayout>
  );
}

export function PickupInfo() {
  return (
    <InfoLayout icon="store" kicker="Getting your order" title="Pick up at our store: free">
      <Point at={8}>We <B>call or WhatsApp you</B> when it is ready.</Point>
      <Point at={20}>Show the <B>pickup code</B> from your order page.</Point>
      <Point at={32} tone={MUTED}>Kikuyu Warehouse · Thogoto · Kinoo · Lucky Summer · Pipeline · Utawala</Point>
    </InfoLayout>
  );
}

export function ReturnsInfo() {
  const frame = useCurrentFrame();
  const stamp = interpolate(frame, [34, 42], [2, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <InfoLayout icon="back" kicker="Not happy with it?" title="Return it within 3 days">
      <Point at={8}>Changed your mind? Bring it back to <B>our store within 3 days</B>.</Point>
      <Point at={18}>We refund you on <B>M-Pesa</B>.</Point>
      <Sfx name="pop" at={34} volume={0.5} />
      <div style={{ alignSelf: "center", marginTop: 40, fontSize: 56, fontWeight: 800, color: GREEN, border: `6px solid ${GREEN}`, borderRadius: 20, padding: "14px 34px", transform: `scale(${stamp}) rotate(-4deg)`, opacity: frame > 34 ? 1 : 0 }}>
        3-DAY RETURNS
      </div>
    </InfoLayout>
  );
}

export const INFO_SCENES = [
  { Scene: DepositInfo, frames: CARD_FRAMES },
  { Scene: PickupInfo, frames: CARD_FRAMES },
  { Scene: DeliveryScene, frames: DELIVERY_FRAMES },
  { Scene: ReturnsInfo, frames: 75 }
];
export const INFO_TOTAL = INFO_SCENES.reduce((sum, s) => sum + s.frames, 0);
