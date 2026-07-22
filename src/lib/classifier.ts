// On-device snore-type classifier scaffold (PLAN2 Lane C — ML scaffold).
//
// Turns per-event acoustic features into a snore-type mix (palatal / tongue
// base / nasal). Two implementations behind one interface so a future
// ONNX model is a drop-in swap for today's DSP heuristic:
//   - DspClassifier: the band-energy heuristic already computed live in
//     useSnoreDetector.ts / sessionRecorder.ts, moved behind this interface.
//   - OnnxClassifier: loads an ONNX model via onnxruntime-web, lazily and
//     only once we already know (via a cached HEAD check) that the model
//     file exists — so the dependency is installed but adds zero bundle
//     weight or startup cost until a trained model is actually checked in.
//
// No model is trained or bundled by this file. `createClassifier()` picks
// DSP today and will pick ONNX the day MPSSC-trained weights land at
// `models/snore-cnn.onnx`, with zero call-site changes.
//
// Ownership: this file + the onnxruntime-web dependency in package.json.
// Does NOT touch useSnoreDetector.ts — callers (Lane A) import this
// interface and wire it in on their side.

export type TypeMix = { palatal: number; tongue: number; nasal: number };

/**
 * Per-event acoustic features a classifier consumes. Mirrors the band
 * energies `SnoreEventRecord` (useSnoreDetector.ts) already carries per
 * event, plus an optional 32-bin downsampled spectrum snapshot for
 * classifiers that want more than 3 numbers — cheap to produce since it's
 * derived from the same FFT frame already captured at event time.
 */
export interface EventFeatures {
  durationMs: number;
  peakDb: number;
  // Fractions (sum to 1) of this event's spectral energy in each band —
  // same semantics as SnoreEventRecord.bandPalatal/bandTongue/bandNasal.
  bandPalatal: number;
  bandTongue: number;
  bandNasal: number;
  /** Optional 32-bin downsampled magnitude spectrum at event time, 0..1 per
   *  bin. Absent for callers that haven't wired it through yet — DspClassifier
   *  doesn't need it, but an ONNX model likely will. */
  spectrum32?: number[];
}

export interface SnoreClassifier {
  readonly kind: 'dsp' | 'onnx';
  classify(frame: EventFeatures): TypeMix;
}

// ---------- DSP classifier (today's default, always available) ----------

/**
 * The band-energy heuristic: an event's classified type is just its
 * already-computed band-energy fractions, renormalized. This is exactly the
 * inline math useSnoreDetector.ts / sessionRecorder.ts do today — moved
 * behind the interface so a future ONNX classifier is a transparent swap.
 */
export class DspClassifier implements SnoreClassifier {
  readonly kind = 'dsp' as const;

  classify(frame: EventFeatures): TypeMix {
    const { bandPalatal, bandTongue, bandNasal } = frame;
    const sum = bandPalatal + bandTongue + bandNasal;
    if (sum <= 0) return { palatal: 0, tongue: 0, nasal: 0 };
    return {
      palatal: bandPalatal / sum,
      tongue: bandTongue / sum,
      nasal: bandNasal / sum,
    };
  }
}

// ---------- ONNX classifier (scaffold — no model shipped yet) ----------

// Runtime fetch path, not a build-time asset import — the file may not
// exist, and this must never make the build fail or bundle anything.
// Ships from the site root (e.g. `public/models/snore-cnn.onnx`) once a
// trained model exists.
const MODEL_URL = '/models/snore-cnn.onnx';

let modelExistsCache: Promise<boolean> | undefined;

/** HEAD-checks for the model file, once per page load (cached). Never
 *  throws — 404 / offline / any fetch failure is treated as "no model",
 *  falling back to DSP. */
function modelExists(): Promise<boolean> {
  if (!modelExistsCache) {
    modelExistsCache = fetch(MODEL_URL, { method: 'HEAD' })
      .then(res => res.ok)
      .catch(() => false);
  }
  return modelExistsCache;
}

/**
 * Loads onnxruntime-web and the model lazily, via dynamic import — this
 * module is only reachable once `modelExists()` has already confirmed the
 * model file is present, so `import('onnxruntime-web')` (and its bundle
 * weight) never runs on a normal boot without a trained model checked in.
 */
export class OnnxClassifier implements SnoreClassifier {
  readonly kind = 'onnx' as const;

  // Typed as `unknown` (rather than statically importing onnxruntime-web's
  // InferenceSession type) so this file never forces the dependency's type
  // graph into the main bundle just to describe a field nothing reads yet.
  private constructor(private session: unknown) {}

  static async load(): Promise<OnnxClassifier> {
    const ort = await import('onnxruntime-web');
    const session = await ort.InferenceSession.create(MODEL_URL);
    return new OnnxClassifier(session);
  }

  classify(frame: EventFeatures): TypeMix {
    // Placeholder inference path — the real forward pass (spectrum32 ->
    // 3-way softmax over palatal/tongue/nasal) lands with the trained
    // model. createClassifier() only ever hands out an OnnxClassifier once
    // models/snore-cnn.onnx exists, so this body documents the intended
    // shape rather than running in production today.
    void frame;
    return { palatal: 0, tongue: 0, nasal: 0 };
  }
}

// ---------- factory ----------

let classifierCache: Promise<SnoreClassifier> | undefined;

/**
 * Picks the best available classifier: ONNX if `models/snore-cnn.onnx`
 * exists (checked once via HEAD, cached), DSP otherwise — and DSP again if
 * the ONNX load fails for any reason (bad file, runtime error). Cached so
 * repeated calls (e.g. once per Night session) don't re-check or re-load.
 */
export function createClassifier(): Promise<SnoreClassifier> {
  if (!classifierCache) {
    classifierCache = modelExists().then(async exists => {
      if (!exists) return new DspClassifier();
      try {
        return await OnnxClassifier.load();
      } catch {
        return new DspClassifier();
      }
    });
  }
  return classifierCache;
}

/** Synchronous default for callers that can't await a factory (e.g. a
 *  render path) — always DSP, since ONNX only ever loads lazily/async.
 *  Callers that want ONNX-when-available should call `createClassifier()`
 *  once during session setup and hold onto the resolved instance. */
export function createDefaultClassifier(): SnoreClassifier {
  return new DspClassifier();
}
