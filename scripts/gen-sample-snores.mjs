// Offline-render 3 short snore-like WAVs for demo/sample playback (Lane C —
// see PLAN3.md). Pure Node, no dependencies: a hand-rolled 16-bit PCM WAV
// writer plus a small synth (sawtooth + shaped noise under a breath
// envelope). Deterministic (seeded PRNG) — re-running reproduces byte-
// identical output.
//
// Each clip layers a 70-160Hz sawtooth with filtered noise under a repeating
// breath envelope (inhale rasp ~1.2s, pause ~1.2s), with a distinct acoustic
// character per RESEARCH.md's §1 band findings (low 40-300Hz / mid 301-850Hz
// / high 851-2000Hz map to obstruction site — the real backing for our
// palatal/tongue-base/nasal snoreTypes mix):
//   snore-1.wav "palatal rumble"       — low sawtooth + sub-harmonic, slow
//                                        tremolo, lowpassed (muffled) noise
//   snore-2.wav "tongue-base broadband" — flatter tone, wide bandpassed
//                                        noise, rougher/less tonal texture
//   snore-3.wav "nasal flutter"        — brighter sawtooth + overtone, fast
//                                        amplitude flutter, highpassed
//                                        (hissy) noise
//
// Run: node scripts/gen-sample-snores.mjs
// Writes public/samples/snore-{1,2,3}.wav (~70-80 KB each, ~200-230 KB total).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/samples/', import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

const SAMPLE_RATE = 8000; // 4kHz Nyquist — plenty for content topping out ~2kHz

// ---------- deterministic PRNG (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -1..1 sawtooth from a phase counted in cycles (not radians).
function sawtooth(phaseCycles) {
  const f = phaseCycles - Math.floor(phaseCycles);
  return 2 * f - 1;
}

// One-pole IIR filters, in place — cheap, deterministic, dependency-free
// stand-ins for a real band/low/high-pass; plenty for "distinct character"
// decorative synthesis rather than clinical fidelity.
function lowpass(buf, alpha) {
  let y = buf[0];
  for (let i = 0; i < buf.length; i++) { y += alpha * (buf[i] - y); buf[i] = y; }
}
function highpass(buf, alpha) {
  let y = 0;
  let xPrev = buf[0];
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    y = alpha * (y + x - xPrev);
    xPrev = x;
    buf[i] = y;
  }
}

function normalize(buf, target = 0.92) {
  let max = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > max) max = a; }
  if (max < 1e-9) return;
  const g = target / max;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
}

// Breath envelope: a hump per active window (fast attack, slower release)
// inside a repeating cycle, silence for the rest — "inhale rasp ~1.2s,
// pause, repeat".
function breathEnvelope(tSec, cycleLen, activeLen) {
  const phase = tSec % cycleLen;
  if (phase >= activeLen) return 0;
  const x = phase / activeLen; // 0..1 across the active window
  const attack = Math.min(1, x / 0.12);
  const release = Math.min(1, (1 - x) / 0.35);
  return Math.min(attack, release) * (0.6 + 0.4 * Math.sin(Math.PI * x));
}

const CYCLE_LEN = 2.4;
const ACTIVE_LEN = 1.2;

const CHAR_SPECS = [
  {
    file: 'snore-1.wav',
    name: 'palatal rumble',
    durationSec: 4.4,
    seed: 1,
    baseFreq: 88,          // low end of the 70-160Hz sawtooth band
    subHarmonicRatio: 0.5, // half-frequency layer for rumble depth
    toneMix: 0.78,
    noiseMix: 0.22,
    noiseFilter: 'low',
    tremoloHz: 5,
    tremoloDepth: 0.18,
  },
  {
    file: 'snore-2.wav',
    name: 'tongue-base broadband',
    durationSec: 5.0,
    seed: 2,
    baseFreq: 122,
    subHarmonicRatio: 0,
    toneMix: 0.48,
    noiseMix: 0.52,
    noiseFilter: 'band',
    tremoloHz: 6.5,
    tremoloDepth: 0.12,
  },
  {
    file: 'snore-3.wav',
    name: 'nasal flutter',
    durationSec: 4.7,
    seed: 3,
    baseFreq: 152,         // top of the 70-160Hz band
    overtoneRatio: 2,
    overtoneMix: 0.25,
    toneMix: 0.55,
    noiseMix: 0.45,
    noiseFilter: 'high',
    tremoloHz: 11,         // the "flutter"
    tremoloDepth: 0.35,
  },
];

function renderSpec(spec) {
  const n = Math.round(spec.durationSec * SAMPLE_RATE);
  const rand = mulberry32(spec.seed * 7919 + 13);

  const noise = new Float64Array(n);
  for (let i = 0; i < n; i++) noise[i] = rand() * 2 - 1;
  if (spec.noiseFilter === 'low') {
    lowpass(noise, 0.06);
  } else if (spec.noiseFilter === 'high') {
    highpass(noise, 0.35);
  } else {
    // crude bandpass: difference of two lowpasses at different corners
    const lo = noise.slice();
    lowpass(lo, 0.25);
    const lo2 = lo.slice();
    lowpass(lo2, 0.03);
    for (let i = 0; i < n; i++) noise[i] = lo[i] - lo2[i];
  }
  normalize(noise, 1);

  const out = new Float64Array(n);
  let tonePhase = 0, subPhase = 0, overtonePhase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = breathEnvelope(t, CYCLE_LEN, ACTIVE_LEN);
    if (env <= 0) { out[i] = 0; continue; }

    const jitter = 1 + 0.03 * Math.sin(2 * Math.PI * 0.6 * t); // slight realism wobble
    const freq = spec.baseFreq * jitter;
    tonePhase += freq / SAMPLE_RATE;
    let tone = sawtooth(tonePhase);

    if (spec.subHarmonicRatio) {
      subPhase += (freq * spec.subHarmonicRatio) / SAMPLE_RATE;
      tone = tone * 0.75 + sawtooth(subPhase) * 0.25;
    }
    if (spec.overtoneMix) {
      overtonePhase += (freq * spec.overtoneRatio) / SAMPLE_RATE;
      tone = tone * (1 - spec.overtoneMix) + sawtooth(overtonePhase) * spec.overtoneMix;
    }

    const tremolo = 1 - spec.tremoloDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * spec.tremoloHz * t));
    out[i] = (tone * spec.toneMix + noise[i] * spec.noiseMix) * tremolo * env;
  }
  normalize(out, 0.85);
  return out;
}

// ---------- hand-rolled 16-bit PCM mono WAV writer ----------
function encodeWav(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);       // fmt chunk size (PCM)
  buf.writeUInt16LE(1, 20);        // audio format = PCM
  buf.writeUInt16LE(1, 22);        // channels = mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate (mono, 16-bit)
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buf;
}

for (const spec of CHAR_SPECS) {
  const samples = renderSpec(spec);
  const wav = encodeWav(samples, SAMPLE_RATE);
  writeFileSync(OUT_DIR + spec.file, wav);
  console.log(`${spec.file}  "${spec.name}"  ${spec.durationSec}s  ${(wav.length / 1024).toFixed(1)} KB`);
}
