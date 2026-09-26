import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { DELIVERY_FRAMES, DeliveryScene } from "./delivery-scene";
import { ACCENT, GREEN, INK, MUTED, Sfx, useIn } from "./shared";

// Closing scenes shared by both how-to-buy videos: delivery, then returns.

const RETURNS_FRAMES = 90;

function ReturnsScene() {
  const frame = useCurrentFrame();
  const a = useIn(0, 12);
  const b = useIn(6);
  const line = useIn(14);
  const chip = useIn(24);
  const stamp = interpolate(frame, [36, 44], [2, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", textAlign: "center", paddingTop: 250 }}>
      <Sfx name="pop" at={36} volume={0.5} />
      <div style={{ width: 170, height: 170, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${a})` }}>
        <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" />
        </svg>
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color: ACCENT, marginTop: 34, letterSpacing: 3, opacity: b }}>STEP 4 · RETURNS</div>
      <div style={{ fontSize: 92, fontWeight: 800, marginTop: 12, letterSpacing: -2, lineHeight: 1.02, padding: "0 60px", opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>
        3-day returns,<br />no questions asked
      </div>
      <div style={{ fontSize: 46, fontWeight: 600, color: MUTED, marginTop: 40, padding: "0 90px", lineHeight: 1.3, opacity: line }}>
        Not happy? Contact us within 3 days and get your money back.
      </div>
      <div style={{ marginTop: 44, display: "inline-flex", alignItems: "center", gap: 18, background: "white", borderRadius: 999, padding: "20px 40px", fontSize: 46, fontWeight: 800, color: INK, boxShadow: "0 12px 30px rgba(31,27,24,0.1)", opacity: chip, transform: `scale(${0.85 + 0.15 * chip})` }}>
        <span style={{ color: GREEN }}>WhatsApp</span> 0717 834 529
      </div>
      <div style={{ marginTop: 60, fontSize: 60, fontWeight: 800, color: GREEN, border: `7px solid ${GREEN}`, borderRadius: 20, padding: "12px 36px", transform: `scale(${stamp}) rotate(-4deg)`, opacity: frame > 36 ? 1 : 0 }}>
        MONEY-BACK
      </div>
    </AbsoluteFill>
  );
}

export const INFO_SCENES = [
  { Scene: DeliveryScene, frames: DELIVERY_FRAMES },
  { Scene: ReturnsScene, frames: RETURNS_FRAMES }
];
export const INFO_TOTAL = INFO_SCENES.reduce((sum, s) => sum + s.frames, 0);
