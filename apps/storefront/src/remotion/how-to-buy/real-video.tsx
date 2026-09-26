import type { ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import steps from "./steps.json";
import { INFO_SCENES, INFO_TOTAL } from "./info-scenes";
import { ACCENT, Backdrop, FONT, GREEN, INK, MUTED, Music, Phone, ProgressBar, Sfx, Tap, Wordmark, useFonts, useIn } from "./shared";

// Screenshots were taken at a 390x844 CSS viewport (2x). Tap rects are in CSS px.
const VIEW_W = 390;
const SCREEN_W = 640;
const SCREEN_H = Math.round((SCREEN_W * 844) / VIEW_W);
const K = SCREEN_W / VIEW_W;
const PHONE_TOP = 400;
const STEP_NAMES = ["Choose", "Buy", "Delivery", "Returns"];

type Scene = {
  shot: string;
  step: 1 | 2;
  title: string;
  frames: number;
  tapAt?: number;
  illustration?: "pin" | "paid";
};

const GOODS = ["shoes", "bags", "jackets", "baby"] as const;
const GOODS_LABEL: Record<(typeof GOODS)[number], string> = { shoes: "Shoes", bags: "Bags", jackets: "Men's jackets", baby: "Baby clothes" };
const GROUP_FRAMES = 27;
const MONTAGE = 12 + GOODS.length * GROUP_FRAMES + 6;
const OUTRO = 60;

const SCENES: Scene[] = [
  { shot: "02-category", step: 1, title: "Pick what you like", frames: 45, tapAt: 20 },
  { shot: "03-product", step: 1, title: "Tap Add to bag", frames: 48, tapAt: 22 },
  { shot: "04-added", step: 2, title: "Go to your bag", frames: 30, tapAt: 6 },
  { shot: "05-bag", step: 2, title: "Go to your bag", frames: 33, tapAt: 10 },
  { shot: "06-checkout", step: 2, title: "Add your M-Pesa number", frames: 33, tapAt: 10 },
  { shot: "08-phone-typed", step: 2, title: "Add your M-Pesa number", frames: 33, tapAt: 12 },
  { shot: "09-checkout-phone", step: 2, title: "Delivery or free pickup", frames: 30, tapAt: 8 },
  { shot: "10-pickup", step: 2, title: "Delivery or free pickup", frames: 42, tapAt: 18 },
  { shot: "11-pickup-chosen", step: 2, title: "Delivery or free pickup", frames: 27, tapAt: 4 },
  { shot: "12-ready-to-pay", step: 2, title: "Pay with M-Pesa", frames: 42, tapAt: 18 },
  { shot: "12-ready-to-pay", step: 2, title: "Enter your M-Pesa PIN", frames: 36, illustration: "pin" },
  { shot: "12-ready-to-pay", step: 2, title: "Paid!", frames: 33, illustration: "paid" }
];

const starts = SCENES.reduce<number[]>((acc, scene, i) => [...acc, i === 0 ? MONTAGE : acc[i - 1] + SCENES[i - 1].frames], []);
const INFO_START = MONTAGE + SCENES.reduce((sum, scene) => sum + scene.frames, 0);
export const REAL_DURATION = INFO_START + INFO_TOTAL + OUTRO;

const payStep = steps.find((s) => s.name === "12-ready-to-pay");
const PAY_AMOUNT = payStep?.tap.text.match(/KSh\s*[\d,]+/i)?.[0] ?? "KSh 500";

function tapRect(shot: string) {
  const step = steps.find((s) => s.name === shot);
  if (!step) return null;
  return { x: step.tap.x * K, y: step.tap.y * K, w: step.tap.w * K, h: step.tap.h * K };
}

export function HowToBuyReal() {
  useFonts();
  const frame = useCurrentFrame();
  const phoneIn = interpolate(frame, [MONTAGE - 12, MONTAGE + 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 3) });
  const outroStart = REAL_DURATION - OUTRO;
  const phoneOut = interpolate(frame, [INFO_START - 5, INFO_START + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: INK }}>
      <Backdrop />
      <Music duration={REAL_DURATION} />

      <Sequence durationInFrames={MONTAGE + 4}>
        <Montage />
      </Sequence>

      {SCENES.map((scene, i) => (
        <Sequence key={i} from={starts[i]} durationInFrames={scene.frames}>
          <Caption scene={scene} newStep={i === 0 || SCENES[i - 1].step !== scene.step} animate={i === 0 || SCENES[i - 1].title !== scene.title} last={i === SCENES.length - 1 || SCENES[i + 1].title !== scene.title} />
          {i === 0 || SCENES[i - 1].step !== scene.step ? <Sfx name="whoosh" at={0} volume={0.35} /> : null}
        </Sequence>
      ))}

      <div style={{
        position: "absolute", left: (1080 - SCREEN_W) / 2 - 19, top: PHONE_TOP,
        transform: `translateY(${phoneIn * 1600 + phoneOut * 1700}px)`
      }}>
        <Phone screenW={SCREEN_W} screenH={SCREEN_H}>
          {SCENES.map((scene, i) => {
            const local = frame - starts[i];
            // Screens cross-fade quickly; the phone itself stays still.
            const sameScreen = i > 0 && SCENES[i - 1].shot === scene.shot;
            const opacity = i === 0 || sameScreen ? 1 : interpolate(local, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const visible = (local >= 0 && (i === SCENES.length - 1 || frame < starts[i + 1] + 8)) || (i === 0 && frame < starts[0]);
            if (!visible) return null;
            const rect = tapRect(scene.shot);
            return (
              <div key={i} style={{ position: "absolute", inset: 0, overflow: "hidden", opacity }}>
                <div style={{ position: "absolute", inset: 0 }}>
                  <Img src={staticFile(`real/${scene.shot}.png`)} style={{ width: SCREEN_W, height: SCREEN_H, display: "block" }} />
                  {scene.illustration ? (
                    <Sequence from={starts[i]} durationInFrames={scene.frames}>
                      {scene.illustration === "pin" ? <PinPrompt /> : <PaidScreen />}
                    </Sequence>
                  ) : null}
                  {rect && scene.tapAt !== undefined && !scene.illustration ? (
                    <Sequence from={starts[i]} durationInFrames={scene.frames}>
                      <Tap {...rect} at={scene.tapAt} />
                    </Sequence>
                  ) : null}
                </div>
              </div>
            );
          })}
        </Phone>
      </div>

      {INFO_SCENES.map(({ Scene, frames }, i) => (
        <Sequence key={i} from={INFO_START + INFO_SCENES.slice(0, i).reduce((sum, s) => sum + s.frames, 0)} durationInFrames={frames}>
          <Fade frames={frames}>
            <ProgressBar step={i + 3} total={STEP_NAMES.length} />
            <Scene />
          </Fade>
          <Sfx name="whoosh" at={0} volume={0.3} />
        </Sequence>
      ))}

      <Sequence from={outroStart}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}

function Fade({ frames, children }: { frames: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 6, frames - 6, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

/** Opening: the brand, then quick 2x3 grids of real pieces by category. */
function Montage() {
  const frame = useCurrentFrame();
  const head = useIn(0, 12);
  const out = interpolate(frame, [MONTAGE - 8, MONTAGE], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const group = Math.min(GOODS.length - 1, Math.max(0, Math.floor((frame - 12) / GROUP_FRAMES)));
  const local = frame - 12 - group * GROUP_FRAMES;
  const cat = GOODS[group];
  return (
    <AbsoluteFill style={{ alignItems: "center", textAlign: "center", paddingTop: 110, opacity: out }}>
      {GOODS.map((_, g) => <Sfx key={g} name="pop" at={12 + g * GROUP_FRAMES} volume={0.3} />)}
      <div style={{ opacity: head, transform: `scale(${0.85 + 0.15 * head})` }}><Wordmark size={88} /></div>
      <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, marginTop: 18, opacity: head }}>
        Great pieces.<br /><span style={{ color: ACCENT }}>Huge choice.</span>
      </div>
      <div style={{ marginTop: 34, height: 70, fontSize: 44, fontWeight: 800, color: "white" }}>
        <span key={cat} style={{ display: "inline-block", background: INK, borderRadius: 999, padding: "10px 34px", transform: `scale(${interpolate(local, [0, 6], [0.7, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})` }}>
          {GOODS_LABEL[cat]}
        </span>
      </div>
      <div style={{ marginTop: 36, width: 900, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 26 }}>
        {Array.from({ length: 6 }, (_, i) => {
          const t = local - i * 2;
          const s = interpolate(t, [0, 7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (x) => 1 - Math.pow(1 - x, 3) });
          const leave = group < GOODS.length - 1 ? interpolate(local, [GROUP_FRAMES - 4, GROUP_FRAMES], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
          return (
            <div key={`${cat}-${i}`} style={{ background: "white", borderRadius: 28, padding: 14, boxShadow: "0 16px 34px rgba(31,27,24,0.12)", opacity: s * leave, transform: `translateY(${(1 - s) * 60}px) scale(${0.9 + 0.1 * s})` }}>
              <Img src={staticFile(`goods/${cat}-${i}.jpg`)} style={{ width: "100%", height: 360, objectFit: "contain", display: "block" }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Caption({ scene, newStep, animate, last }: { scene: Scene; newStep: boolean; animate: boolean; last: boolean }) {
  const frame = useCurrentFrame();
  const enter = useIn(0, 16);
  const shown = animate ? enter : 1;
  const exit = last ? interpolate(frame, [scene.frames - 5, scene.frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 90, textAlign: "center" }}>
      <ProgressBar step={scene.step} total={STEP_NAMES.length} animate={newStep} />
      <div style={{ fontSize: 34, fontWeight: 700, color: ACCENT, letterSpacing: 3 }}>STEP {scene.step} · {STEP_NAMES[scene.step - 1].toUpperCase()}</div>
      <div style={{ opacity: shown * exit, transform: `translateY(${(1 - shown) * 30}px)`, padding: "0 60px" }}>
        <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.05, marginTop: 20, letterSpacing: -2 }}>{scene.title}</div>
      </div>
    </AbsoluteFill>
  );
}

/** Illustration of the M-Pesa PIN prompt; the real one comes from the phone, not the website. */
function PinPrompt() {
  const frame = useCurrentFrame();
  const pop = useIn(4, 12);
  const dots = Math.max(0, Math.min(4, Math.floor((frame - 8) / 4)));
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${0.5 * pop})`, alignItems: "center", justifyContent: "center" }}>
      <IllustrationTag />
      {[0, 1, 2, 3].map((k) => <Sfx key={k} name="type" at={8 + k * 4} volume={0.4} />)}
      <div style={{ width: 520, background: "white", borderRadius: 18, padding: "36px 36px 26px", transform: `scale(${0.7 + 0.3 * pop})`, opacity: pop, boxShadow: "0 20px 40px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: GREEN }}>M-PESA</div>
        <div style={{ fontSize: 28, marginTop: 14, lineHeight: 1.35 }}>Do you want to pay {PAY_AMOUNT} to Direct Loop?</div>
        <div style={{ fontSize: 26, marginTop: 22, color: MUTED }}>Enter M-PESA PIN</div>
        <div style={{ display: "flex", gap: 18, marginTop: 12, borderBottom: `3px solid ${GREEN}`, paddingBottom: 12, height: 40 }}>
          {Array.from({ length: dots }, (_, i) => <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: INK, marginTop: 8 }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 40, marginTop: 24, fontSize: 28, fontWeight: 700, color: GREEN }}>
          <span style={{ color: MUTED }}>CANCEL</span><span>SEND</span>
        </div>
      </div>
      {dots >= 4 ? <Tap x={468} y={SCREEN_H / 2 + 118} w={80} h={50} at={22} ring={false} /> : null}
    </AbsoluteFill>
  );
}

/** Illustration of the "Payment successful" screen shown after paying. */
function PaidScreen() {
  const check = useIn(2, 10);
  const text = useIn(8);
  return (
    <AbsoluteFill style={{ background: "white", alignItems: "center", paddingTop: 420, fontFamily: FONT }}>
      <IllustrationTag />
      <Sfx name="success" at={2} volume={0.55} />
      <div style={{ width: 190, height: 190, borderRadius: "50%", background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${check})` }}>
        <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <div style={{ opacity: text, textAlign: "center", marginTop: 44 }}>
        <div style={{ fontSize: 50, fontWeight: 800 }}>Payment successful</div>
        <div style={{ fontSize: 28, color: MUTED, marginTop: 14 }}>M-Pesa receipt ••••••••••</div>
      </div>
    </AbsoluteFill>
  );
}

function IllustrationTag() {
  return (
    <div style={{ position: "absolute", top: 22, right: 22, background: "rgba(31,27,24,0.8)", color: "white", fontSize: 20, fontWeight: 700, padding: "6px 14px", borderRadius: 999, zIndex: 2 }}>
      Illustration
    </div>
  );
}

function Outro() {
  const a = useIn(0);
  const b = useIn(10);
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }) }}>
      <div style={{ transform: `scale(${0.85 + 0.15 * a})`, opacity: a }}><Wordmark size={120} /></div>
      <div style={{ fontSize: 68, fontWeight: 800, marginTop: 20, color: ACCENT, opacity: a }}>dloop.co.ke</div>
      <div style={{ opacity: b, transform: `translateY(${(1 - b) * 30}px)`, marginTop: 60, display: "flex", flexDirection: "column", gap: 18, fontSize: 42, fontWeight: 700 }}>
        <div>✓ Great pieces, huge choice</div>
        <div>✓ Delivered in 2 days</div>
        <div>✓ 3-day money-back returns</div>
      </div>
    </AbsoluteFill>
  );
}
