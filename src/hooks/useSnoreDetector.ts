import { useCallback, useEffect, useRef, useState } from 'react';

// Live snore detection from the device microphone.
//
// Uses the Web Audio API (getUserMedia -> AnalyserNode). Snoring is loud, low-
// frequency (~60-500 Hz) and sustained, so we threshold loudness against an
// adaptive noise floor AND require low-frequency dominance — that keeps taps,
// claps and clicks from counting. A refractory window stops one snore from
// being counted many times. No audio leaves the device; nothing is recorded.

export type DetectorStatus =
  | 'idle' | 'requesting' | 'listening' | 'denied' | 'unsupported' | 'simulated';

interface DetectorState {
  status: DetectorStatus;
  level: number;       // 0..1 smoothed loudness, for the orb / meter
  db: number;          // approximate dB for display
  snoreCount: number;
  peakDb: number;
  lastEventTs: number; // ms timestamp of the last detected snore (drives the flash)
  levels: number[];    // recent loudness history, for the waveform
  // Live snore-type mix (fractions) classified from the spectral band where each
  // event's energy sits: palatal (low rumble), tongue base (mid), nasal (high).
  typeMix: { palatal: number; tongue: number; nasal: number };
}

const HISTORY = 48;
const initial = (): DetectorState => ({
  status: 'idle', level: 0, db: 0, snoreCount: 0, peakDb: 0,
  lastEventTs: 0, levels: new Array(HISTORY).fill(0),
  typeMix: { palatal: 0, tongue: 0, nasal: 0 },
});

export function useSnoreDetector() {
  const [state, setState] = useState<DetectorState>(initial);

  const r = useRef({
    ctx: undefined as AudioContext | undefined,
    stream: undefined as MediaStream | undefined,
    analyser: undefined as AnalyserNode | undefined,
    td: undefined as Float32Array<ArrayBuffer> | undefined,
    fd: undefined as Uint8Array<ArrayBuffer> | undefined,
    raf: 0,
    sim: 0,
    running: false,
    noiseFloor: 0.005,
    loudSince: 0,
    refractoryUntil: 0,
    snoreCount: 0,
    peakDb: 0,
    smooth: 0,
    levels: new Array(HISTORY).fill(0) as number[],
    frame: 0,
    typeAccum: { palatal: 0, tongue: 0, nasal: 0 },
  });

  const stop = useCallback(() => {
    const c = r.current;
    c.running = false;
    if (c.raf) cancelAnimationFrame(c.raf);
    if (c.sim) clearInterval(c.sim);
    c.stream?.getTracks().forEach(t => t.stop());
    c.ctx?.close().catch(() => {});
    c.ctx = c.stream = c.analyser = c.td = c.fd = undefined;
    c.raf = c.sim = 0;
  }, []);

  const tick = useCallback(() => {
    const c = r.current;
    if (!c.running || !c.analyser || !c.td || !c.fd || !c.ctx) return;

    c.analyser.getFloatTimeDomainData(c.td);
    let sum = 0;
    for (let i = 0; i < c.td.length; i++) sum += c.td[i] * c.td[i];
    const rms = Math.sqrt(sum / c.td.length);

    // Low-frequency energy share (the snore band).
    c.analyser.getByteFrequencyData(c.fd);
    const nyquist = c.ctx.sampleRate / 2;
    const binHz = nyquist / c.fd.length;
    const loBin = Math.max(1, Math.floor(60 / binHz));
    const hiBin = Math.min(c.fd.length - 1, Math.ceil(500 / binHz));
    let lo = 0;
    for (let i = loBin; i <= hiBin; i++) lo += c.fd[i];
    const lowEnergy = lo / ((hiBin - loBin + 1) * 255); // 0..1

    c.smooth = c.smooth * 0.8 + Math.min(1, rms * 8) * 0.2;
    const level = c.smooth;
    const db = Math.round(Math.max(0, Math.min(92, 90 + 20 * Math.log10(rms + 1e-6))));

    const now = performance.now();
    const loud = rms > c.noiseFloor * 2.4 && rms > 0.012 && lowEnergy > 0.18;
    if (!loud) c.noiseFloor = c.noiseFloor * 0.995 + rms * 0.005; // adapt when quiet

    let event = false;
    if (loud) {
      if (c.loudSince === 0) c.loudSince = now;
      if (now - c.loudSince > 300 && now > c.refractoryUntil) {
        event = true;
        c.snoreCount += 1;
        c.refractoryUntil = now + 1300;
        c.loudSince = 0;
        // Classify this snore by the band where its energy sits (vibration site).
        const band = (loHz: number, hiHz: number) => {
          const lo = Math.max(1, Math.floor(loHz / binHz));
          const hi = Math.min(c.fd!.length - 1, Math.ceil(hiHz / binHz));
          let sum = 0;
          for (let i = lo; i <= hi; i++) sum += c.fd![i];
          return sum;
        };
        c.typeAccum.palatal += band(60, 300);   // soft palate — low rumble
        c.typeAccum.tongue += band(300, 1000);  // tongue base — mid, broadband
        c.typeAccum.nasal += band(1000, 3000);  // nasal — high flutter
      }
    } else {
      c.loudSince = 0;
    }
    if (rms > 0.012 && db > c.peakDb) c.peakDb = db;

    c.frame++;
    if (c.frame % 2 === 0) {
      c.levels.push(level);
      if (c.levels.length > HISTORY) c.levels.shift();
    }

    if (event || c.frame % 3 === 0) {
      const acc = c.typeAccum;
      const accSum = acc.palatal + acc.tongue + acc.nasal;
      const typeMix = accSum > 0
        ? { palatal: acc.palatal / accSum, tongue: acc.tongue / accSum, nasal: acc.nasal / accSum }
        : { palatal: 0, tongue: 0, nasal: 0 };
      setState(s => ({
        status: 'listening',
        level,
        db,
        snoreCount: c.snoreCount,
        peakDb: c.peakDb,
        lastEventTs: event ? Date.now() : s.lastEventTs,
        levels: c.levels.slice(),
        typeMix,
      }));
    }
    c.raf = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || (window as any).webkitAudioContext)) {
      setState(s => ({ ...s, status: 'unsupported' }));
      return;
    }
    setState(s => ({ ...s, status: 'requesting' }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      if (ctx.state === 'suspended') await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(analyser);

      const c = r.current;
      c.ctx = ctx;
      c.stream = stream;
      c.analyser = analyser;
      c.td = new Float32Array(analyser.fftSize);
      c.fd = new Uint8Array(analyser.frequencyBinCount);
      c.noiseFloor = 0.005;
      c.loudSince = 0;
      c.refractoryUntil = 0;
      c.typeAccum = { palatal: 0, tongue: 0, nasal: 0 };
      c.running = true;
      setState(s => ({ ...s, status: 'listening' }));
      c.raf = requestAnimationFrame(tick);
    } catch {
      setState(s => ({ ...s, status: 'denied' }));
    }
  }, [tick]);

  // Fallback when there's no mic / permission is denied — keeps the demo flowing.
  const startSimulated = useCallback(() => {
    const c = r.current;
    c.running = true;
    setState(s => ({ ...s, status: 'simulated' }));
    c.sim = window.setInterval(() => {
      const lvl = 0.15 + Math.random() * 0.6;
      c.levels.push(lvl);
      if (c.levels.length > HISTORY) c.levels.shift();
      const event = Math.random() < 0.3;
      if (event) {
        c.snoreCount += 1;
        c.peakDb = Math.max(c.peakDb, 42 + Math.round(Math.random() * 12));
        c.typeAccum.palatal += 50 + Math.random() * 40;
        c.typeAccum.tongue += 15 + Math.random() * 22;
        c.typeAccum.nasal += 5 + Math.random() * 12;
      }
      const acc = c.typeAccum;
      const accSum = acc.palatal + acc.tongue + acc.nasal;
      const typeMix = accSum > 0
        ? { palatal: acc.palatal / accSum, tongue: acc.tongue / accSum, nasal: acc.nasal / accSum }
        : { palatal: 0, tongue: 0, nasal: 0 };
      setState(s => ({
        ...s,
        level: lvl,
        db: 44,
        snoreCount: c.snoreCount,
        peakDb: c.peakDb,
        lastEventTs: event ? Date.now() : s.lastEventTs,
        levels: c.levels.slice(),
        typeMix,
      }));
    }, 650);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { ...state, start, startSimulated, stop };
}
