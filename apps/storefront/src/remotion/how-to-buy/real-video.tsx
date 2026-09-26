import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import steps from "./steps.json";
import { ACCENT, CREAM, FONT, GREEN, INK, MUTED, Phone, StepPill, Tap, Wordmark, useFonts, useIn } from "./shared";

// Screenshots were taken at a 390x844 CSS viewport (2x). Tap rects are in CSS px.
const VIEW_W = 390;
const SCREEN_W = 640;
const SCREEN_H = Math.round((SCREEN_W * 844) / VIEW_W);
const K = SCREEN_W / VIEW_W;
const PHONE_TOP = 400;
const TOTAL_STEPS = 5;

type Scene = {
  shot: string;
  step: number;
  title: string;
  sub?: string;
  frames: number;
  tapAt?: number;
  illustration?: "pin" | "paid";
};

const INTRO = 75;
const OUTRO = 110;
const SCENES: Scene[] = [
  { shot: "01-home", step: 1, title: "Open dloop.co.ke", sub: "Tap a category", frames: 90, tapAt: 38 },
  { shot: "02-category", step: 1, title: "Tap an item you like", frames: 80, tapAt: 30 },
  { shot: "03-product", step: 2, title: "Check the size and price", sub: "Then tap Add to bag", frames: 105, tapAt: 55 },
  { shot: "04-added", step: 2, title: "Added! Tap View bag", frames: 75, tapAt: 25 },
  { shot: "05-bag", step: 2, title: "Check your bag", sub: "Tap Next", frames: 80, tapAt: 32 },
  { shot: "06-checkout", step: 3, title: "Tap Payment", sub: "to add your M-Pesa number", frames: 85, tapAt: 35 },
  { shot: "07-phone", step: 3, title: "Type your M-Pesa number", sub: "The phone that will pay", frames: 70, tapAt: 22 },
  { shot: "08-phone-typed", step: 3, title: "Type your M-Pesa number", sub: "Tap Save and continue", frames: 75, tapAt: 28 },
  { shot: "09-checkout-phone", step: 4, title: "Now tap Pickup", frames: 75, tapAt: 28 },
  { shot: "10-pickup", step: 4, title: "Pickup is free", sub: "Choose your pickup point (courier delivery is KSh 50)", frames: 110, tapAt: 50 },
  { shot: "11-pickup-chosen", step: 4, title: "Tap Save and continue", frames: 70, tapAt: 25 },
  { shot: "12-ready-to-pay", step: 5, title: "Pay in full, or 50% now", sub: "Then tap Pay with M-Pesa", frames: 115, tapAt: 65 },
  { shot: "12-ready-to-pay", step: 5, title: "Enter your M-Pesa PIN", sub: "on the prompt that pops up on your phone", frames: 105, illustration: "pin" },
  { shot: "12-ready-to-pay", step: 5, title: "Done! Your order is paid", sub: "Tap View order to follow it", frames: 95, illustration: "paid" }
];

const starts = SCENES.reduce<number[]>((acc, scene, i) => [...acc, i === 0 ? INTRO : acc[i - 1] + SCENES[i - 1].frames], []);
export const REAL_DURATION = INTRO + SCENES.reduce((sum, scene) => sum + scene.frames, 0) + OUTRO;

function tapRect(shot: string) {
  const step = steps.find((s) => s.name === shot);
  if (!step) return null;
  return { x: step.tap.x * K, y: step.tap.y * K, w: step.tap.w * K, h: step.tap.h * K };
}

export function HowToBuyReal() {
  useFonts();
  const frame = useCurrentFrame();
  const phoneIn = interpolate(frame, [20, 50], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outroStart = REAL_DURATION - OUTRO;
  const phoneOut = interpolate(frame, [outroStart - 5, outroStart + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: CREAM, fontFamily: FONT, color: INK }}>
      <Sequence durationInFrames={INTRO + 10}>
        <Intro />
      </Sequence>

      {SCENES.map((scene, i) => (
        <Sequence key={i} from={starts[i]} durationInFrames={scene.frames}>
          <Caption scene={scene} animate={i === 0 || SCENES[i - 1].title !== scene.title} last={i === SCENES.length - 1 || SCENES[i + 1].title !== scene.title} />
        </Sequence>
      ))}

      <div style={{
        position: "absolute", left: (1080 - SCREEN_W) / 2 - 19, top: PHONE_TOP,
        transform: `translateY(${phoneIn * 1500 + phoneOut * 1600}px)`
      }}>
        <Phone screenW={SCREEN_W} screenH={SCREEN_H}>
          {SCENES.map((scene, i) => {
            const local = frame - starts[i];
            // Screens cross-fade: each fades in over its first 8 frames and stays until the next one covers it.
            const opacity = i === 0 ? 1 : interpolate(local, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const visible = local >= 0 && (i === SCENES.length - 1 || frame < starts[i + 1] + 8) || (i === 0 && frame < starts[0]);
            if (!visible) return null;
            const rect = tapRect(scene.shot);
            return (
              <div key={i} style={{ position: "absolute", inset: 0, opacity }}>
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
            );
          })}
        </Phone>
      </div>

      <Sequence from={outroStart}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}

function Caption({ scene, animate, last }: { scene: Scene; animate: boolean; last: boolean }) {
  const frame = useCurrentFrame();
  const enter = useIn(0, 16);
  const shown = animate ? enter : 1;
  const exit = last ? interpolate(frame, [scene.frames - 6, scene.frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 70, textAlign: "center" }}>
      <StepPill index={scene.step} total={TOTAL_STEPS} />
      <div style={{ opacity: shown * exit, transform: `translateY(${(1 - shown) * 30}px)`, padding: "0 60px" }}>
        <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, marginTop: 28, letterSpacing: -1 }}>{scene.title}</div>
        {scene.sub ? <div style={{ fontSize: 38, fontWeight: 600, color: MUTED, marginTop: 16, lineHeight: 1.25 }}>{scene.sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
}

function Intro() {
  const frame = useCurrentFrame();
  const a = useIn(0);
  const b = useIn(10);
  const out = interpolate(frame, [INTRO - 10, INTRO], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 150, textAlign: "center", opacity: out }}>
      <div style={{ transform: `scale(${0.8 + 0.2 * a})`, opacity: a }}><Wordmark size={96} /></div>
      <div style={{ fontSize: 84, fontWeight: 800, marginTop: 30, opacity: b, transform: `translateY(${(1 - b) * 40}px)`, letterSpacing: -1 }}>
        How to buy
      </div>
      <div style={{ fontSize: 44, fontWeight: 600, color: ACCENT, marginTop: 10, opacity: b }}>5 easy steps</div>
    </AbsoluteFill>
  );
}

/** Illustration of the M-Pesa PIN prompt; the real one comes from the phone, not the website. */
function PinPrompt() {
  const frame = useCurrentFrame();
  const pop = useIn(8, 12);
  const dots = Math.max(0, Math.min(4, Math.floor((frame - 35) / 9)));
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${0.5 * pop})`, alignItems: "center", justifyContent: "center" }}>
      <IllustrationTag />
      <div style={{ width: 520, background: "white", borderRadius: 18, padding: "36px 36px 26px", transform: `scale(${0.7 + 0.3 * pop})`, opacity: pop, boxShadow: "0 20px 40px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: GREEN }}>M-PESA</div>
        <div style={{ fontSize: 28, marginTop: 14, lineHeight: 1.35 }}>Do you want to pay KSh 250 to Direct Loop?</div>
        <div style={{ fontSize: 26, marginTop: 22, color: MUTED }}>Enter M-PESA PIN</div>
        <div style={{ display: "flex", gap: 18, marginTop: 12, borderBottom: `3px solid ${GREEN}`, paddingBottom: 12, height: 40 }}>
          {Array.from({ length: dots }, (_, i) => <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: INK, marginTop: 8 }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 40, marginTop: 24, fontSize: 28, fontWeight: 700, color: GREEN }}>
          <span style={{ color: MUTED }}>CANCEL</span><span>SEND</span>
        </div>
      </div>
      {dots >= 4 ? <Tap x={468} y={SCREEN_H / 2 + 118} w={80} h={50} at={72} ring={false} /> : null}
    </AbsoluteFill>
  );
}

/** Illustration of the "Payment successful" screen shown after paying. */
function PaidScreen() {
  const check = useIn(6, 10);
  const text = useIn(16);
  return (
    <AbsoluteFill style={{ background: "white", alignItems: "center", paddingTop: 300, fontFamily: FONT }}>
      <IllustrationTag />
      <div style={{ width: 170, height: 170, borderRadius: "50%", background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${check})` }}>
        <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <div style={{ opacity: text, textAlign: "center", marginTop: 40 }}>
        <div style={{ fontSize: 46, fontWeight: 800 }}>Payment successful</div>
        <div style={{ fontSize: 26, color: MUTED, marginTop: 14 }}>M-Pesa receipt ••••••••••</div>
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, bottom: 90, height: 96, borderRadius: 12, background: INK, color: "white", fontSize: 32, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", opacity: text }}>
        View order
      </div>
      <Tap x={40} y={SCREEN_H - 186} w={SCREEN_W - 80} h={96} at={55} />
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
  const b = useIn(12);
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" }) }}>
      <div style={{ transform: `scale(${0.85 + 0.15 * a})`, opacity: a }}><Wordmark size={110} /></div>
      <div style={{ fontSize: 60, fontWeight: 800, marginTop: 24, opacity: a }}>dloop.co.ke</div>
      <div style={{ opacity: b, transform: `translateY(${(1 - b) * 30}px)`, marginTop: 70 }}>
        <div style={{ fontSize: 40, fontWeight: 600, color: MUTED }}>Questions? Chat with us on WhatsApp</div>
        <div style={{ fontSize: 64, fontWeight: 800, color: GREEN, marginTop: 12 }}>0717 834 529</div>
      </div>
    </AbsoluteFill>
  );
}
