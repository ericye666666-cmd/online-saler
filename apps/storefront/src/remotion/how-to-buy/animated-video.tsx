import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { INFO_SCENES } from "./info-scenes";
import { ACCENT, CREAM, FONT, GREEN, INK, MUTED, Tap, Wordmark, useFonts, useIn } from "./shared";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const SCENES: Array<{ frames: number; render: () => ReactNode }> = [
  { frames: 80, render: () => <Title /> },
  { frames: 115, render: () => <FindScene /> },
  { frames: 115, render: () => <BagScene /> },
  { frames: 85, render: () => <PhoneScene /> },
  { frames: 125, render: () => <PickupScene /> },
  { frames: 105, render: () => <PayScene /> },
  ...INFO_SCENES.map(({ Scene, frames }) => ({ frames, render: () => <Scene /> })),
  { frames: 105, render: () => <Outro /> }
];
export const ANIMATED_DURATION = SCENES.reduce((sum, s) => sum + s.frames, 0);

export function HowToBuyAnimated() {
  useFonts();
  let from = 0;
  return (
    <AbsoluteFill style={{ background: CREAM, fontFamily: FONT, color: INK }}>
      {SCENES.map((scene, i) => {
        const start = from;
        from += scene.frames;
        return (
          <Sequence key={i} from={start} durationInFrames={scene.frames}>
            <SceneFade frames={scene.frames}>{scene.render()}</SceneFade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

function SceneFade({ frames, children }: { frames: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 8, frames - 8, frames], [0, 1, 1, 0], clamp);
  const y = interpolate(frame, [0, 10], [40, 0], clamp);
  return <AbsoluteFill style={{ opacity: o, transform: `translateY(${y}px)` }}>{children}</AbsoluteFill>;
}

function Header({ n, title, sub }: { n: number; title: string; sub?: string }) {
  const a = useIn(0, 12);
  const b = useIn(6);
  return (
    <div style={{ position: "absolute", top: 150, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{
        width: 150, height: 150, borderRadius: "50%", background: ACCENT, color: "white", fontSize: 92, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${a}) rotate(${(1 - a) * -90}deg)`
      }}>{n}</div>
      <div style={{ fontSize: 82, fontWeight: 800, marginTop: 36, letterSpacing: -1.5, lineHeight: 1.05, opacity: b, transform: `translateY(${(1 - b) * 30}px)`, padding: "0 70px" }}>{title}</div>
      {sub ? <div style={{ fontSize: 40, fontWeight: 600, color: MUTED, marginTop: 18, opacity: b, padding: "0 80px", lineHeight: 1.3 }}>{sub}</div> : null}
    </div>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "white", borderRadius: 36, boxShadow: "0 30px 60px rgba(31,27,24,0.14)", ...style }}>{children}</div>;
}

function Title() {
  const a = useIn(0);
  const b = useIn(12);
  const frame = useCurrentFrame();
  const products = ["p1", "p2", "p3", "p4"];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      {products.map((p, i) => {
        const s = useIn(4 + i * 5);
        const angle = [-14, 10, -8, 12][i];
        const pos = [[-330, -560], [330, -520], [-320, 560], [330, 600]][i];
        const drift = Math.sin((frame + i * 20) / 18) * 8;
        return (
          <Img key={p} src={staticFile(`${p}.png`)} style={{
            position: "absolute", width: 300, height: 300, borderRadius: 30, left: 540 - 150 + pos[0], top: 960 - 150 + pos[1] + drift,
            transform: `scale(${s}) rotate(${angle}deg)`, boxShadow: "0 20px 40px rgba(0,0,0,0.15)", border: "10px solid white"
          }} />
        );
      })}
      <div style={{ transform: `scale(${0.8 + 0.2 * a})`, opacity: a }}><Wordmark size={100} /></div>
      <div style={{ fontSize: 96, fontWeight: 800, marginTop: 20, letterSpacing: -2, opacity: b, transform: `translateY(${(1 - b) * 40}px)` }}>How to buy</div>
      <div style={{ fontSize: 48, fontWeight: 700, color: ACCENT, marginTop: 10, opacity: b }}>in 5 easy steps</div>
    </AbsoluteFill>
  );
}

function FindScene() {
  const frame = useCurrentFrame();
  const products = ["p1", "p2", "p3", "p4"];
  const zoom = interpolate(frame, [70, 90], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Header n={1} title="Find something you love" sub="Open dloop.co.ke and browse" />
      <div style={{ position: "absolute", top: 720, left: 110, width: 860, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        {products.map((p, i) => {
          const s = useIn(10 + i * 5);
          const chosen = i === 0;
          const scale = chosen ? 1 + zoom * 0.08 : 1 - zoom * 0.06;
          return (
            <Card key={p} style={{ padding: 18, transform: `scale(${s * scale})`, opacity: chosen ? 1 : 1 - zoom * 0.5, outline: chosen && zoom > 0 ? `6px solid ${ACCENT}` : undefined }}>
              <Img src={staticFile(`${p}.png`)} style={{ width: "100%", height: 330, objectFit: "cover", borderRadius: 22 }} />
              <div style={{ fontSize: 34, fontWeight: 800, marginTop: 14, paddingLeft: 6 }}>KSh 250</div>
            </Card>
          );
        })}
      </div>
      <Tap x={110} y={720} w={410} h={420} at={55} ring={false} />
    </AbsoluteFill>
  );
}

function BagScene() {
  const frame = useCurrentFrame();
  const fly = interpolate(frame, [58, 82], [0, 1], { ...clamp, easing: (t) => t * t });
  const badge = useIn(82, 8);
  const pressed = frame >= 50;
  return (
    <AbsoluteFill>
      <Header n={2} title="Tap Add to bag" sub="Every piece is one of a kind" />
      <BagIcon badge={badge} />
      <Card style={{ position: "absolute", top: 680, left: 170, width: 740, padding: 30 }}>
        <Img src={staticFile("p1.png")} style={{ width: "100%", height: 560, objectFit: "cover", borderRadius: 24 }} />
        <div style={{ fontSize: 40, fontWeight: 700, marginTop: 22 }}>Black Polka Dot T-Shirt</div>
        <div style={{ fontSize: 32, color: MUTED, marginTop: 6 }}>M · UK 10-12</div>
        <div style={{ fontSize: 44, fontWeight: 800, marginTop: 8 }}>KSh 250</div>
        <div style={{
          marginTop: 26, height: 104, borderRadius: 14, background: pressed ? GREEN : INK, color: "white", fontSize: 38, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>{pressed ? "✓ Added to bag" : "Add to bag"}</div>
      </Card>
      {fly > 0 && fly < 1 ? (
        <Img src={staticFile("p1.png")} style={{
          position: "absolute", width: 200 - 150 * fly, height: 200 - 150 * fly, borderRadius: 20,
          left: interpolate(fly, [0, 0.6, 1], [440, 900, 925]), top: interpolate(fly, [0, 0.6, 1], [900, 520, 110]),
          boxShadow: "0 10px 20px rgba(0,0,0,0.2)"
        }} />
      ) : null}
      <Tap x={200} y={1470} w={680} h={104} at={36} />
    </AbsoluteFill>
  );
}

function BagIcon({ badge }: { badge: number }) {
  return (
    <div style={{ position: "absolute", top: 60, right: 70, width: 110, height: 110 }}>
      <svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" />
      </svg>
      <div style={{
        position: "absolute", top: -6, right: -6, width: 52, height: 52, borderRadius: "50%", background: ACCENT, color: "white",
        fontSize: 32, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${badge})`
      }}>1</div>
    </div>
  );
}

function PhoneScene() {
  const frame = useCurrentFrame();
  const number = "0712 345 678";
  const typed = number.slice(0, Math.max(0, Math.floor((frame - 15) / 2.5)));
  const done = typed.length === number.length;
  const ok = useIn(46, 10);
  return (
    <AbsoluteFill>
      <Header n={3} title="Add your M-Pesa number" sub="Go to your bag, tap Next, then Payment" />
      <Card style={{ position: "absolute", top: 780, left: 110, width: 860, padding: 50 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: MUTED, letterSpacing: 2 }}>M-PESA PHONE</div>
        <div style={{
          marginTop: 20, height: 130, borderRadius: 18, border: `4px solid ${done ? GREEN : INK}`, display: "flex", alignItems: "center",
          padding: "0 34px", fontSize: 62, fontWeight: 700, letterSpacing: 2
        }}>
          {typed || <span style={{ color: "#bbb" }}>07…</span>}
          {!done && frame % 20 < 10 ? <span style={{ width: 4, height: 64, background: INK, marginLeft: 4 }} /> : null}
          {done ? <span style={{ marginLeft: "auto", color: GREEN, transform: `scale(${ok})`, fontSize: 64 }}>✓</span> : null}
        </div>
        <div style={{ fontSize: 32, color: MUTED, marginTop: 26, lineHeight: 1.35 }}>Use the phone that will pay. The payment prompt is sent there.</div>
      </Card>
    </AbsoluteFill>
  );
}

const POINTS = ["Kikuyu Warehouse", "Thogoto", "Kinoo", "Lucky Summer", "Pipeline", "Utawala"];

function PickupScene() {
  const frame = useCurrentFrame();
  const pick = frame >= 80;
  return (
    <AbsoluteFill>
      <Header n={4} title="Pick up at our store: free" sub="Choose the pickup point nearest you" />
      <div style={{ position: "absolute", top: 740, left: 110, width: 860, display: "flex", flexDirection: "column", gap: 22 }}>
        {POINTS.map((point, i) => {
          const s = useIn(10 + i * 5);
          const chosen = pick && i === 0;
          return (
            <div key={point} style={{
              transform: `translateX(${(1 - s) * 400}px)`, opacity: s, background: chosen ? INK : "white", color: chosen ? "white" : INK,
              borderRadius: 22, padding: "26px 36px", fontSize: 42, fontWeight: 700, display: "flex", alignItems: "center", gap: 24,
              boxShadow: "0 10px 24px rgba(31,27,24,0.08)"
            }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill={chosen ? ACCENT : "none"} stroke={chosen ? ACCENT : ACCENT} strokeWidth="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" fill="white" /></svg>
              {point}
              {chosen ? <span style={{ marginLeft: "auto", color: GREEN }}>✓</span> : null}
            </div>
          );
        })}
      </div>
      <Tap x={110} y={740} w={860} h={102} at={65} ring={false} />
      <div style={{ position: "absolute", bottom: 150, left: 0, right: 0, textAlign: "center", fontSize: 36, color: MUTED, fontWeight: 600, opacity: useIn(50) }}>
        Or door-to-door delivery in Nairobi · KSh 200
      </div>
    </AbsoluteFill>
  );
}

function PayScene() {
  const frame = useCurrentFrame();
  const plan = frame >= 16 ? 0 : -1;
  const prompt = useIn(40, 12);
  const dots = Math.max(0, Math.min(4, Math.floor((frame - 50) / 5)));
  const paid = useIn(74, 10);
  return (
    <AbsoluteFill>
      <Header n={5} title="Pay with M-Pesa" sub="Pay in full, or pay 50% now and the rest within 7 days" />
      <div style={{ position: "absolute", top: 760, left: 110, width: 860, display: "flex", flexDirection: "column", gap: 24, opacity: 1 - prompt * 0.6 }}>
        {[["Pay in full", "KSh 250"], ["Pay 50% now", "KSh 125"]].map(([label, amount], i) => (
          <div key={label} style={{
            background: "white", borderRadius: 22, padding: "30px 36px", fontSize: 42, fontWeight: 700, display: "flex", gap: 24, alignItems: "center",
            border: `5px solid ${plan === i ? INK : "transparent"}`, opacity: useIn(8 + i * 6)
          }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", border: `4px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {plan === i ? <div style={{ width: 20, height: 20, borderRadius: "50%", background: INK }} /> : null}
            </div>
            {label}<span style={{ marginLeft: "auto" }}>{amount}</span>
          </div>
        ))}
        <div style={{ marginTop: 20, height: 120, borderRadius: 18, background: INK, color: "white", fontSize: 42, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", opacity: useIn(20) }}>
          Pay KSh 250 with M-Pesa
        </div>
      </div>
      <Tap x={110} y={760} w={860} h={110} at={4} ring={false} />
      <Tap x={110} y={1062} w={860} h={120} at={24} />
      {prompt > 0.01 ? (
        <Card style={{ position: "absolute", top: 820, left: 170, width: 740, padding: 50, transform: `scale(${0.7 + 0.3 * prompt})`, opacity: prompt }}>
          {paid < 0.5 ? (
            <>
              <div style={{ fontSize: 40, fontWeight: 800, color: GREEN }}>M-PESA</div>
              <div style={{ fontSize: 36, marginTop: 16, lineHeight: 1.35 }}>A prompt pops up on your phone. Enter your M-Pesa PIN.</div>
              <div style={{ display: "flex", gap: 28, marginTop: 30, justifyContent: "center" }}>
                {[0, 1, 2, 3].map((i) => <div key={i} style={{ width: 44, height: 44, borderRadius: "50%", border: `4px solid ${INK}`, background: i < dots ? INK : "transparent" }} />)}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", transform: `scale(${paid})` }}>
              <div style={{ width: 150, height: 150, borderRadius: "50%", background: GREEN, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </div>
              <div style={{ fontSize: 50, fontWeight: 800, marginTop: 28 }}>Payment successful</div>
              <div style={{ fontSize: 34, color: MUTED, marginTop: 10 }}>Tap View order to follow it</div>
            </div>
          )}
        </Card>
      ) : null}
    </AbsoluteFill>
  );
}

function Outro() {
  const a = useIn(0);
  const b = useIn(14);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontSize: 90, fontWeight: 800, letterSpacing: -2, opacity: a, transform: `scale(${0.85 + 0.15 * a})` }}>That's it!</div>
      <div style={{ marginTop: 50, opacity: a }}><Wordmark size={100} /></div>
      <div style={{ fontSize: 60, fontWeight: 800, marginTop: 14, color: ACCENT, opacity: a }}>dloop.co.ke</div>
      <div style={{ opacity: b, transform: `translateY(${(1 - b) * 30}px)`, marginTop: 80 }}>
        <div style={{ fontSize: 40, fontWeight: 600, color: MUTED }}>Questions? Chat with us on WhatsApp</div>
        <div style={{ fontSize: 64, fontWeight: 800, color: GREEN, marginTop: 12 }}>0717 834 529</div>
      </div>
    </AbsoluteFill>
  );
}
