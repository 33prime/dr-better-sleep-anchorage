import { useCallback, useEffect, useRef, useState } from 'react';
import { noteEvent, stopClipCapture, currentChunkIndex } from '../lib/clipRecorder';

// Live snore detection from the device microphone.
//
// Uses the Web Audio API (getUserMedia -> AnalyserNode). Snoring is loud, low-
// frequency (~60-500 Hz) and sustained, so we threshold loudness against an
// adaptive noise floor AND require low-frequency dominance — that keeps taps,
// claps and clicks from counting. A refractory window stops one snore from
// being counted many times. No audio leaves the device; nothing is recorded.
//
// In addition to the live aggregate state (for the orb/meter/waveform), each
// confirmed snore is emitted once as a finished record via `onEvent` — that's
// the per-event feed `sessionRecorder` buffers and persists.

export type DetectorStatus =
  | 'idle' | 'requesting' | 'listening' | 'denied' | 'unsupported' | 'simulated';

/** One finished snore, ready to hand to a recorder. */
export interface SnoreEventRecord {
  ts: number;           // epoch ms, approx onset of the snore
  durationMs: number;   // how long the loud spell lasted
  peakDb: number;       // loudest reading during the event
  // Fractions (sum to 1) of this event's spectral energy in each band —
  // the vibration site: palatal (low rumble), tongue base (mid), nasal (high).
  bandPalatal: number;
  bandTongue: number;
  bandNasal: number;
}

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

export function useSnoreDetector(onEvent?: (event: SnoreEventRecord) => void) {
  const [state, setState] = useState<DetectorState>(initial);

  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

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
    loudSince: 0,        // performance.now() the current loud spell began, 0 if not loud
    loudSinceWall: 0,    // Date.now() paired with loudSince, for real event timestamps
    refractoryUntil: 0,
    snoreCount: 0,
    peakDb: 0,
    smooth: 0,
    levels: new Array(HISTORY).fill(0) as number[],
    frame: 0,
    typeAccum: { palatal: 0, tongue: 0, nasal: 0 }, // running mix, for the live typeMix display
    // Duration tracking for the *current* confirmed event, independent of the
    // refractory window so we capture the event's real length even though
    // the count/flash fire the moment it's confirmed (300ms in).
    durActive: false,
    durStartPerf: 0,
    durStartWall: 0,
    durPeakDb: 0,
    durBand: { palatal: 0, tongue: 0, nasal: 0 },
    // Chunk index clipRecorder was actively recording into at this event's
    // true onset (durStartWall/durStartPerf) — captured the moment durActive
    // flips true, *not* when the event is finally reported (which can be
    // many chunks later for a sustained snore). Lets clipRecorder freeze the
    // clip's window from the real onset instead of anchoring only to the
    // chunk active when the event happened to end.
    durOnsetChunkIndex: 0,
  });

  const stop = useCallback(() => {
    const c = r.current;
    c.running = false;
    if (c.raf) cancelAnimationFrame(c.raf);
    if (c.sim) clearInterval(c.sim);
    const stream = c.stream;
    const ctx = c.ctx;
    c.ctx = c.stream = c.analyser = c.td = c.fd = undefined;
    c.raf = c.sim = 0;
    c.durActive = false;
    // Stop clip capture *before* tearing down the mic stream/AudioContext —
    // MediaRecorder needs the tracks alive a moment longer to flush its
    // final chunk cleanly. Doing this here (rather than relying on a
    // separate effect in whatever component calls this hook) means the
    // ordering no longer depends on React running effect cleanups in a
    // particular sequence relative to this hook's own unmount cleanup.
    void stopClipCapture().finally(() => {
      stream?.getTracks().forEach(t => t.stop());
      ctx?.close().catch(() => {});
    });
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

    // Band-energy split, computed every tick so duration tracking can
    // accumulate it across the whole event, not just the trigger instant.
    const band = (loHz: number, hiHz: number) => {
      const bLo = Math.max(1, Math.floor(loHz / binHz));
      const bHi = Math.min(c.fd!.length - 1, Math.ceil(hiHz / binHz));
      let s = 0;
      for (let i = bLo; i <= bHi; i++) s += c.fd![i];
      return s;
    };
    const bPalatal = band(60, 300);   // soft palate — low rumble
    const bTongue = band(300, 1000);  // tongue base — mid, broadband
    const bNasal = band(1000, 3000);  // nasal — high flutter

    c.smooth = c.smooth * 0.8 + Math.min(1, rms * 8) * 0.2;
    const level = c.smooth;
    const db = Math.round(Math.max(0, Math.min(92, 90 + 20 * Math.log10(rms + 1e-6))));

    const now = performance.now();
    const loud = rms > c.noiseFloor * 2.4 && rms > 0.012 && lowEnergy > 0.18;
    if (!loud) c.noiseFloor = c.noiseFloor * 0.995 + rms * 0.005; // adapt when quiet

    let event = false;
    if (loud) {
      if (c.loudSince === 0) { c.loudSince = now; c.loudSinceWall = Date.now(); }
      if (now - c.loudSince > 300 && now > c.refractoryUntil && !c.durActive) {
        event = true;
        c.snoreCount += 1;
        c.refractoryUntil = now + 1300;
        // Start duration tracking from the true onset (loudSince), not this tick.
        c.durActive = true;
        c.durStartPerf = c.loudSince;
        c.durStartWall = c.loudSinceWall;
        // Snapshot which chunk clipRecorder is recording into right now —
        // this event's real onset — so a sustained snore's clip window is
        // anchored to where it started, not wherever recording happens to
        // be by the time the loud spell finally quiets down.
        c.durOnsetChunkIndex = currentChunkIndex();
        c.durPeakDb = db;
        c.durBand = { palatal: bPalatal, tongue: bTongue, nasal: bNasal };
        c.loudSince = 0;
        c.typeAccum.palatal += bPalatal;
        c.typeAccum.tongue += bTongue;
        c.typeAccum.nasal += bNasal;
      } else if (c.durActive) {
        // Still within the same loud spell — keep extending the event's
        // duration/peak/band totals until it actually quiets down.
        c.durPeakDb = Math.max(c.durPeakDb, db);
        c.durBand.palatal += bPalatal;
        c.durBand.tongue += bTongue;
        c.durBand.nasal += bNasal;
      }
    } else {
      c.loudSince = 0;
      if (c.durActive) {
        const durationMs = Math.max(1, Math.round(now - c.durStartPerf));
        const accSum = c.durBand.palatal + c.durBand.tongue + c.durBand.nasal;
        const record: SnoreEventRecord = {
          ts: c.durStartWall,
          durationMs,
          peakDb: c.durPeakDb,
          bandPalatal: accSum > 0 ? c.durBand.palatal / accSum : 0,
          bandTongue: accSum > 0 ? c.durBand.tongue / accSum : 0,
          bandNasal: accSum > 0 ? c.durBand.nasal / accSum : 0,
        };
        c.durActive = false;
        noteEvent({ ts: record.ts, peakDb: record.peakDb, onsetChunkIndex: c.durOnsetChunkIndex });
        onEventRef.current?.(record);
      }
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
      c.durActive = false;
      c.durOnsetChunkIndex = 0;
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
        const peakDb = 42 + Math.round(Math.random() * 12);
        c.peakDb = Math.max(c.peakDb, peakDb);
        const dPalatal = 50 + Math.random() * 40;
        const dTongue = 15 + Math.random() * 22;
        const dNasal = 5 + Math.random() * 12;
        c.typeAccum.palatal += dPalatal;
        c.typeAccum.tongue += dTongue;
        c.typeAccum.nasal += dNasal;
        const dSum = dPalatal + dTongue + dNasal;
        onEventRef.current?.({
          ts: Date.now(),
          durationMs: 300 + Math.round(Math.random() * 1200),
          peakDb,
          bandPalatal: dPalatal / dSum,
          bandTongue: dTongue / dSum,
          bandNasal: dNasal / dSum,
        });
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

  // The live getUserMedia stream, when running for real (never set in
  // simulated mode) — exposed so callers (Night.tsx) can hand the *same*
  // stream to clipRecorder.startClipCapture rather than opening a second
  // mic session.
  return { ...state, start, startSimulated, stop, stream: r.current.stream ?? null };
}
