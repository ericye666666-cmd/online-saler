import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ACCENT, GREEN, INK, MUTED, Sfx, useIn } from "./shared";

// Rider delivery animation: the rider rides from the store to the customer's
// door, hands over the parcel, delivered.

export const DELIVERY_FRAMES = 105;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ROAD_Y = 1250;
const STORE_X = 150;
const HOUSE_X = 900;

export function DeliveryScene() {
  const frame = useCurrentFrame();
  const head = useIn(0, 12);
  const sub = useIn(8);
  const ride = interpolate(frame, [8, 44], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 2) });
  const riderX = interpolate(ride, [0, 1], [STORE_X + 60, HOUSE_X - 400]);
  const moving = frame > 8 && frame < 44;
  const bounce = moving ? Math.sin(frame * 1.3) * 4 : 0;
  const parcel = interpolate(frame, [46, 56], [0, 1], clamp);
  const done = useIn(60, 9);

  return (
    <AbsoluteFill>
      <Sfx name="whoosh" at={8} volume={0.5} />
      <Sfx name="pop" at={48} volume={0.5} />
      <Sfx name="success" at={60} volume={0.55} />
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ fontSize: 34, fontWeight: 700, color: ACCENT, letterSpacing: 3, opacity: head }}>STEP 3 · DELIVERY</div>
        <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, marginTop: 12, opacity: head, transform: `translateY(${(1 - head) * 30}px)` }}>
          Delivered<br />in 2 days
        </div>
        <div style={{ display: "inline-block", marginTop: 26, background: INK, color: "white", fontSize: 40, fontWeight: 800, borderRadius: 999, padding: "14px 36px", opacity: sub, transform: `scale(${0.8 + 0.2 * sub})` }}>
          Door to door in Nairobi · KSh 200
        </div>
      </div>

      <svg width="1080" height="1920" style={{ position: "absolute", inset: 0 }}>
        {/* road */}
        <rect x="0" y={ROAD_Y} width="1080" height="150" fill="#d9d1c6" />
        {Array.from({ length: 9 }, (_, i) => <rect key={i} x={i * 130 + 20} y={ROAD_Y + 70} width="70" height="10" rx="5" fill="white" />)}
        {/* route line, drawn as the rider goes */}
        <line x1={STORE_X + 60} y1={ROAD_Y - 10} x2={STORE_X + 60 + (HOUSE_X - STORE_X - 60) * ride} y2={ROAD_Y - 10} stroke={ACCENT} strokeWidth="6" strokeDasharray="4 16" strokeLinecap="round" />
        <Store />
        <House />
        <Customer x={HOUSE_X - 120} happy={done > 0.5} />
        <g transform={`translate(${riderX}, ${ROAD_Y - 150 + bounce})`}>
          <Rider frame={frame} moving={moving} hasParcel={parcel < 0.5} />
        </g>
        {parcel > 0 && parcel < 1 ? (
          <g transform={`translate(${interpolate(parcel, [0, 1], [riderX + 20, HOUSE_X - 140])}, ${ROAD_Y - 170 - Math.sin(parcel * Math.PI) * 60})`}>
            <Parcel />
          </g>
        ) : null}
        {parcel >= 1 ? <g transform={`translate(${HOUSE_X - 150}, ${ROAD_Y - 130})`}><Parcel /></g> : null}
      </svg>

      {/* delivered */}
      <div style={{
        position: "absolute", top: 1480, left: 0, right: 0, textAlign: "center", opacity: done,
        transform: `scale(${interpolate(done, [0, 1], [1.8, 1])}) rotate(-4deg)`
      }}>
        <span style={{ fontSize: 76, fontWeight: 800, color: GREEN, border: `8px solid ${GREEN}`, borderRadius: 22, padding: "10px 36px", background: "rgba(255,255,255,0.9)" }}>DELIVERED ✓</span>
      </div>
    </AbsoluteFill>
  );
}

function Store() {
  const x = STORE_X - 120;
  const y = ROAD_Y - 300;
  return (
    <g>
      <rect x={x} y={y} width="240" height="300" fill="white" stroke={INK} strokeWidth="6" />
      <rect x={x - 10} y={y - 50} width="260" height="60" fill={ACCENT} />
      <text x={x + 120} y={y - 10} textAnchor="middle" fontSize="34" fontWeight="800" fill="white" fontFamily="Georgia, serif">Direct Loop</text>
      <rect x={x + 30} y={y + 150} width="70" height="150" fill={INK} />
      <rect x={x + 130} y={y + 60} width="80" height="80" fill="#f2ece4" stroke={INK} strokeWidth="4" />
    </g>
  );
}

function House() {
  const x = HOUSE_X - 60;
  const y = ROAD_Y - 260;
  return (
    <g>
      <polygon points={`${x - 20},${y} ${x + 110},${y - 110} ${x + 240},${y}`} fill={INK} />
      <rect x={x} y={y} width="220" height="260" fill="white" stroke={INK} strokeWidth="6" />
      <rect x={x + 120} y={y + 110} width="70" height="150" fill={ACCENT} />
      <rect x={x + 25} y={y + 50} width="70" height="70" fill="#f2ece4" stroke={INK} strokeWidth="4" />
    </g>
  );
}

function Customer({ x, happy }: { x: number; happy: boolean }) {
  const y = ROAD_Y - 10;
  return (
    <g>
      <rect x={x - 32} y={y - 150} width="64" height="110" rx="28" fill="#2f6f8f" />
      <rect x={x - 26} y={y - 50} width="20" height="50" rx="8" fill={INK} />
      <rect x={x + 6} y={y - 50} width="20" height="50" rx="8" fill={INK} />
      <circle cx={x} cy={y - 185} r="34" fill="#7a4a2e" />
      <path d={happy ? `M${x - 14} ${y - 180} q14 16 28 0` : `M${x - 12} ${y - 176} h24`} stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Parcel() {
  return (
    <g>
      <rect x="0" y="0" width="70" height="56" rx="6" fill="#c89a5b" stroke={INK} strokeWidth="4" />
      <rect x="30" y="0" width="10" height="56" fill={ACCENT} />
    </g>
  );
}

/** Motorbike rider, drawn around (0,0) = top-left of a ~230x150 box. */
function Rider({ frame, moving, hasParcel }: { frame: number; moving: boolean; hasParcel: boolean }) {
  const spin = moving ? frame * 24 : 0;
  const wheel = (cx: number) => (
    <g transform={`rotate(${spin} ${cx} 120)`}>
      <circle cx={cx} cy="120" r="30" fill={INK} />
      <circle cx={cx} cy="120" r="12" fill="#d9d1c6" />
      <rect x={cx - 2} y="92" width="4" height="56" fill="#d9d1c6" />
    </g>
  );
  return (
    <g>
      {moving ? [0, 1, 2].map((i) => <rect key={i} x={-60 - i * 10} y={70 + i * 18} width={40 - i * 8} height="6" rx="3" fill={MUTED} opacity={0.5} />) : null}
      {wheel(40)}
      {wheel(190)}
      <path d="M40 120 L90 80 L160 80 L190 120" stroke={INK} strokeWidth="10" fill="none" strokeLinejoin="round" />
      <rect x="80" y="70" width="90" height="26" rx="12" fill={ACCENT} />
      <path d="M165 80 L180 40" stroke={INK} strokeWidth="8" strokeLinecap="round" />
      {hasParcel ? <g transform="translate(0,18)"><Parcel /></g> : null}
      {/* rider */}
      <path d="M115 72 L125 20" stroke={GREEN} strokeWidth="26" strokeLinecap="round" />
      <path d="M128 32 L175 42" stroke={GREEN} strokeWidth="12" strokeLinecap="round" />
      <circle cx="130" cy="-4" r="24" fill={ACCENT} />
      <rect x="130" y="-12" width="26" height="12" rx="4" fill={INK} />
    </g>
  );
}
