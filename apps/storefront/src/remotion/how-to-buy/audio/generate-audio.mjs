// Synthesises the how-to-buy soundtrack and UI sounds, so no third-party
// audio (and no licence) is involved. Output goes to ../public/audio.
//   node generate-audio.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
mkdirSync(OUT, { recursive: true });

function writeWav(name, left, right = left) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(join(OUT, name), buf);
}

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function normalize(chs, peak = 0.89) {
  let m = 0;
  for (const ch of chs) for (const v of ch) m = Math.max(m, Math.abs(v));
  for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh((ch[i] / m) * 1.2) * peak;
}

// ---------------------------------------------------------------- music ---
// 120 BPM, I–V–vi–IV in C, 3-3-2 kick (Afro-pop feel), marimba arpeggio.
const BPM = 120;
const STEP = 60 / BPM / 4; // a 16th note
const BAR = STEP * 16;
const SECONDS = 42;
const N = Math.ceil(SECONDS * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

const CHORDS = [
  { root: 36, tones: [60, 64, 67, 72] }, // C
  { root: 43, tones: [59, 62, 67, 71] }, // G
  { root: 45, tones: [57, 60, 64, 69] }, // Am
  { root: 41, tones: [57, 60, 65, 69] } // F
];

function add(buf, start, samples, gain = 1) {
  const s0 = Math.floor(start * SR);
  for (let i = 0; i < samples.length && s0 + i < buf.length; i++) buf[s0 + i] += samples[i] * gain;
}
function addStereo(start, samples, gain, pan = 0) {
  add(L, start, samples, gain * (1 - Math.max(0, pan)));
  add(R, start, samples, gain * (1 + Math.min(0, pan)));
}

function kick() {
  const len = Math.floor(0.32 * SR); const out = new Float32Array(len); let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR; const f = 45 + 110 * Math.exp(-t * 28);
    ph += (2 * Math.PI * f) / SR; out[i] = Math.sin(ph) * Math.exp(-t * 9);
  }
  return out;
}
function clap() {
  const len = Math.floor(0.22 * SR); const out = new Float32Array(len); let hp = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR; const n = rand(); hp = 0.85 * (hp + n - prev); prev = n;
    const env = (t < 0.01 ? 1 : 0.6) * Math.exp(-t * 22) + (t > 0.012 && t < 0.02 ? 0.5 : 0);
    out[i] = hp * env;
  }
  return out;
}
function shaker(accent) {
  const len = Math.floor(0.07 * SR); const out = new Float32Array(len); let hp = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR; const n = rand(); hp = 0.6 * (hp + n - prev); prev = n;
    out[i] = hp * Math.exp(-t * (accent ? 45 : 70)) * Math.min(1, t * 400);
  }
  return out;
}
function bass(midi, dur) {
  const len = Math.floor(dur * SR); const out = new Float32Array(len); const f = hz(midi); let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR; ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph);
    out[i] = Math.tanh(v * 1.4) * Math.min(1, t * 200) * Math.exp(-t * 3.2);
  }
  return out;
}
function marimba(midi) {
  const len = Math.floor(0.6 * SR); const out = new Float32Array(len); const f = hz(midi);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7) + 0.25 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 30)) * Math.min(1, t * 1000);
  }
  return out;
}
function pad(tones, dur) {
  const len = Math.floor(dur * SR); const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR; let v = 0;
    for (const m of tones) { const f = hz(m - 12); v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 1.003 * t); }
    const env = Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 0.3);
    out[i] = (v / tones.length) * env;
  }
  return out;
}

const KICK = [0, 3, 6, 8, 11, 14];
const ARP = [0, 2, 3, 5, 7, 8, 10, 11, 13, 15];
const bars = Math.ceil(SECONDS / BAR);
const k = kick(), c = clap();
for (let b = 0; b < bars; b++) {
  const chord = CHORDS[b % 4];
  const t0 = b * BAR;
  const intro = b === 0;
  addStereo(t0, pad(chord.tones, BAR + 0.1), 0.1);
  for (let s = 0; s < 16; s++) {
    const t = t0 + s * STEP + (s % 2 ? STEP * 0.08 : 0); // light swing
    addStereo(t, shaker(s % 4 === 2), s % 2 ? 0.1 : 0.05, s % 2 ? 0.3 : -0.3);
    if (intro) continue;
    if (KICK.includes(s)) { addStereo(t, k, 0.85); addStereo(t, bass(chord.root, STEP * (s === 6 || s === 14 ? 2 : 3)), 0.35); }
    if (s === 4 || s === 12) addStereo(t, c, 0.32);
  }
  ARP.forEach((s, i) => {
    const note = chord.tones[(i * 3 + b) % chord.tones.length] + (i % 5 === 4 ? 12 : 0);
    const t = t0 + s * STEP;
    const m = marimba(note);
    addStereo(t, m, intro ? 0.12 : 0.2, i % 2 ? 0.4 : -0.4);
    addStereo(t + STEP * 3, m, 0.06, i % 2 ? -0.5 : 0.5); // ping-pong echo
  });
}
// gentle fade in / out
for (let i = 0; i < N; i++) {
  const t = i / SR; const g = Math.min(1, t / 0.6) * Math.min(1, (SECONDS - t) / 2.5);
  L[i] *= g; R[i] *= g;
}
normalize([L, R], 0.85);
writeWav("music.wav", L, R);

// ------------------------------------------------------------------ sfx ---
function sfx(name, dur, fn) {
  const len = Math.floor(dur * SR); const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = fn(i / SR, i);
  normalize([out], 0.8);
  writeWav(name, out);
}
sfx("tap.wav", 0.06, (t) => (Math.sin(2 * Math.PI * 1900 * t) * 0.8 + rand() * 0.25) * Math.exp(-t * 90));
sfx("type.wav", 0.03, (t) => (rand() * 0.6 + Math.sin(2 * Math.PI * 3200 * t) * 0.4) * Math.exp(-t * 220));
sfx("pop.wav", 0.1, (t) => Math.sin(2 * Math.PI * (380 + 5000 * t) * t) * Math.exp(-t * 30) * Math.min(1, t * 800));
let lp = 0;
sfx("whoosh.wav", 0.35, (t) => {
  const cutoff = 0.02 + 0.3 * Math.sin((Math.PI * t) / 0.35);
  lp += cutoff * (rand() - lp);
  return lp * Math.sin((Math.PI * t) / 0.35);
});
sfx("success.wav", 0.9, (t) => {
  const note = (f, at) => (t < at ? 0 : (Math.sin(2 * Math.PI * f * (t - at)) + 0.3 * Math.sin(2 * Math.PI * 2 * f * (t - at))) * Math.exp(-(t - at) * 5));
  return note(1046.5, 0) + note(1318.5, 0.08) + note(1568, 0.16);
});
console.log("audio written to", OUT);
