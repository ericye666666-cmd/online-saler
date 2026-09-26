import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const FPS = 30;
export const INK = "#1f1b18";
export const ACCENT = "#e84c35";
export const CREAM = "#f2ece4";
export const GREEN = "#18a957";
export const MUTED = "#6f6860";
export const FONT = "'Noto Sans', 'Segoe UI', Arial, sans-serif";
export const SERIF = "Georgia, 'Times New Roman', serif";

// Loads Noto Sans from the composition's public dir before the first frame renders.
export function useFonts() {
  const [handle] = useState(() => delayRender("Loading Noto Sans"));
  useEffect(() => {
    const weights = ["400", "600", "700", "800"];
    Promise.all(weights.map(async (weight) => {
      const face = new FontFace("Noto Sans", `url(${staticFile(`noto-${weight}.woff2`)})`, { weight });
      await face.load();
      document.fonts.add(face);
    })).then(() => continueRender(handle), () => continueRender(handle));
  }, [handle]);
}

export function Wordmark({ size = 64, color = INK }: { size?: number; color?: string }) {
  return <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: size, color, letterSpacing: -1 }}>Direct Loop</div>;
}

/** 0→1 entrance spring starting at `delay` frames. */
export function useIn(delay = 0, damping = 14) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.7 } });
}

export function fadeInOut(frame: number, duration: number, edge = 8) {
  return interpolate(frame, [0, edge, duration - edge, duration], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

export function StepPill({ index, total, style }: { index: number; total: number; style?: CSSProperties }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: INK, color: "white", borderRadius: 999, padding: "10px 26px", fontSize: 30, fontWeight: 700, ...style }}>
      <span style={{ color: ACCENT }}>Step {index}</span>
      <span style={{ opacity: 0.6 }}>of {total}</span>
    </div>
  );
}

/** A simple phone: dark bezel, rounded screen, content sized `screenW` x `screenH`. */
export function Phone({ screenW, screenH, children, style }: { screenW: number; screenH: number; children: ReactNode; style?: CSSProperties }) {
  const bezel = Math.round(screenW * 0.03);
  return (
    <div style={{
      width: screenW + bezel * 2, height: screenH + bezel * 2, padding: bezel, borderRadius: 64, background: "#111",
      boxShadow: "0 40px 80px rgba(31,27,24,0.28), 0 8px 20px rgba(31,27,24,0.18)", ...style
    }}>
      <div style={{ width: screenW, height: screenH, borderRadius: 48, overflow: "hidden", position: "relative", background: "white" }}>
        {children}
      </div>
    </div>
  );
}

/** Finger-tap marker: a ring around the target plus a ripple at its centre, starting at `at`. */
export function Tap({ x, y, w, h, at, ring = true }: { x: number; y: number; w: number; h: number; at: number; ring?: boolean }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  const sound = <Sfx name="tap" at={at + 12} volume={0.55} />;
  if (t < 0) return sound;
  const appear = interpolate(t, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const press = interpolate(t, [10, 16, 22], [1, 0.82, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ripple = interpolate(t, [14, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dot = 76;
  return (
    <>
      {sound}
      {ring ? (
        <div style={{
          position: "absolute", left: x - 8, top: y - 8, width: w + 16, height: h + 16, borderRadius: 18,
          border: `6px solid ${ACCENT}`, opacity: appear, boxShadow: `0 0 0 ${8 * appear}px rgba(232,76,53,0.18)`
        }} />
      ) : null}
      <div style={{
        position: "absolute", left: cx - dot, top: cy - dot, width: dot * 2, height: dot * 2, borderRadius: "50%",
        border: `5px solid ${ACCENT}`, opacity: (1 - ripple) * (ripple > 0 ? 1 : 0), transform: `scale(${0.4 + ripple})`
      }} />
      <div style={{
        position: "absolute", left: cx - dot / 2, top: cy - dot / 2, width: dot, height: dot, borderRadius: "50%",
        background: "rgba(232,76,53,0.55)", border: "5px solid white", boxShadow: "0 6px 18px rgba(0,0,0,0.3)",
        opacity: appear, transform: `scale(${appear * press})`
      }} />
    </>
  );
}

/** One-shot UI sound from public/audio at a frame of the enclosing sequence. */
export function Sfx({ name, at, volume = 0.6 }: { name: "tap" | "type" | "pop" | "whoosh" | "success"; at: number; volume?: number }) {
  return (
    <Sequence from={Math.max(0, Math.round(at))} durationInFrames={30} layout="none">
      <Audio src={staticFile(`audio/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}

/** Background track, faded out over the last second. */
export function Music({ duration }: { duration: number }) {
  return (
    <Audio
      src={staticFile("audio/music.wav")}
      volume={(f) => 0.42 * interpolate(f, [duration - 30, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
    />
  );
}

/** Soft drifting colour blobs behind everything. */
export function Backdrop() {
  const frame = useCurrentFrame();
  const blob = (x: number, y: number, r: number, color: string, speed: number, phase: number) => (
    <div style={{
      position: "absolute", width: r * 2, height: r * 2, borderRadius: "50%", background: color, filter: "blur(60px)",
      left: x - r + Math.sin(frame / speed + phase) * 60, top: y - r + Math.cos(frame / (speed * 1.3) + phase) * 50
    }} />
  );
  return (
    <AbsoluteFill style={{ background: CREAM, overflow: "hidden" }}>
      {blob(120, 260, 300, "rgba(232,76,53,0.14)", 40, 0)}
      {blob(980, 900, 340, "rgba(24,169,87,0.10)", 50, 2)}
      {blob(200, 1700, 320, "rgba(232,76,53,0.10)", 45, 4)}
    </AbsoluteFill>
  );
}

/** Five-segment progress bar across the top; `step` 1..total, 0 hides it. */
export function ProgressBar({ step, total, animate = true }: { step: number; total: number; animate?: boolean }) {
  const frame = useCurrentFrame();
  const fill = animate ? interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return (
    <div style={{ position: "absolute", top: 34, left: 60, right: 60, display: "flex", gap: 12 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ flex: 1, height: 10, borderRadius: 5, background: "rgba(31,27,24,0.12)", overflow: "hidden" }}>
          <div style={{ height: "100%", background: ACCENT, width: `${i < step - 1 ? 100 : i === step - 1 ? fill * 100 : 0}%` }} />
        </div>
      ))}
    </div>
  );
}
