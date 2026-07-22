# Make It Real — Phase 2 Contract (clips, dead screens, ML scaffold)

Builds on PLAN.md (Phase 1: Supabase, honest tracking, insights, demo seed).
Do not start lanes until Phase 1 is merged and green. Same non-negotiables.

## Lane A — Snore clip capture & playback (the wow feature)

**Capture** (`src/lib/clipRecorder.ts`, new — owned with `useSnoreDetector.ts`, `sessionRecorder.ts`):
- MediaRecorder on the same getUserMedia stream, `audio/mp4` on Safari / `audio/webm;codecs=opus`
  elsewhere (feature-detect via `MediaRecorder.isTypeSupported`).
- Rolling capture: 4 s timeslice chunks in a ring buffer (~3 chunks). When the detector
  fires an event whose `peakDb` ranks in the night's top 5, freeze the surrounding
  ~8–12 s (prev chunk + current + next) into a Blob.
- Keep top 5 loudest per night, keyed `{sessionId, ts, peakDb, durationMs}` in IndexedDB
  db `dns-sessions`, store `clips`. Evict lower-ranked clips as louder ones arrive.
- Privacy line is product-critical: clips NEVER leave the device. No Supabase upload.
  `nights` gains nothing server-side; clip metadata stays local. Copy in UI: "Clips stay
  on your phone." Delete-all affordance in Profile.
- Battery/CPU guard: recorder only runs while Night session is active.

**Playback**:
- MorningReveal: "Hear your loudest snore" card when clips exist for the revealed night —
  papercraft play button, waveform-ish progress, peak dB caption. Autoplay never.
- ChatRich audio card (`ChatRich.tsx:129` toast stub) plays the real loudest clip when
  one exists; falls back to hiding the card, not a dead toast.
- DetailedNight: clip chips on the timeline at their real timestamps (recorded nights).

## Lane B — Dead-screen fixes (from the audit)

1. **Reorder**: recommendation cards get onClick → `navigate('/night/' + rec.sourceNightDate)`
   (add `sourceNightDate` to Recommendation type + seed data; fall back to latest night).
   Purchase stays mock but honest: button label "Preorder — coming soon" + toast copy that
   doesn't pretend a charge happened. Remove "order history" toast or route it to a simple
   list of `reorder` state.
2. **DetailedNight**: guard every wearable field (positions, positionSnores, stage minutes)
   — recorded nights render the acoustic story (events timeline, type mix, clips, quiet
   stretches) and show one compact "Connect a wearable for stages & position" card instead
   of NaN/crash. Replace the hardcoded hypnogram path + "2:40 back" insight with data-driven
   render for demo/wearable nights, hidden otherwise.
3. **Comparisons**: reframe honestly — compute the user's actual percentile against a
   plausible published-distribution constant (document the source inline from ../RESEARCH.md;
   snore counts distribution) and label the cohort card "How you compare — beta". Kill the
   `66 + filters*4` fake math; filters adjust the reference distribution parameters instead.
4. **ChatRich**: "Share with Sarah" → real Web Share API (`navigator.share`) with a
   text+emoji summary of last night (falls back to clipboard copy + toast). Partner name
   from profile, never hardcoded.
5. **Misc stubs**: DeviceOverview "Adjustment guide" → route to BoilAndBite step guidance
   (it exists); Profile sign-out is real post-Phase-1; remove `/dashboard/dark` route and
   its TABBAR_ROUTES entry (nothing navigates to it).

## Lane C — On-device ML scaffold (if time)

- `src/lib/classifier.ts`: `interface SnoreClassifier { classify(frame: EventFeatures): TypeMix; readonly kind: 'dsp' | 'onnx' }`.
  Move the band-energy heuristic behind it (`DspClassifier`). Export a factory that
  prefers an ONNX model when `models/snore-cnn.onnx` exists — loading via dynamic
  `import('onnxruntime-web')` so the dep is added but tree-shaken/lazy (no startup cost).
- `EventFeatures` = the per-event band energies + 32-bin downsampled spectrum snapshot
  captured at event time (extend detector event payload; cheap, already have the FFT).
- Do NOT train or bundle a model now. The point: pipeline accepts a model file the day
  MPSSC-trained weights exist, zero refactor.

## Clip-store API contract (cross-lane interface — code against this exactly)

`src/lib/clipRecorder.ts` (Lane A) exports:

```ts
export interface SnoreClip {
  id: string;            // `${sessionId}:${ts}`
  sessionId: string;
  nightDate?: string;    // stamped at finalize()
  ts: number;            // event time, unix ms
  peakDb: number;
  durationMs: number;    // clip audio length
  mime: string;          // actual MediaRecorder mime used
}
export function isClipCaptureSupported(): boolean
export function startClipCapture(stream: MediaStream, sessionId: string): void
export function noteEvent(e: { ts: number; peakDb: number }): void   // detector calls per event
export function stopClipCapture(): Promise<void>
export function finalizeClips(sessionId: string, nightDate: string): Promise<void> // sessionRecorder.end() calls
export function latestClips(): Promise<SnoreClip[]>       // newest night's clips, loudest first
export function clipBlob(id: string): Promise<Blob | null> // for playback via URL.createObjectURL
export function deleteAllClips(): Promise<void>
```

Playback consumers (Lane B) import ONLY these. Storage: IndexedDB `dns-sessions`,
new store `clips`. Blobs stay out of React state; create/revoke object URLs around
playback.

## File ownership (parallel lanes — do not cross)

| Lane | Files |
|---|---|
| A clips-capture | `src/lib/clipRecorder.ts`, `src/hooks/useSnoreDetector.ts`, `src/lib/sessionRecorder.ts`, `src/screens/Night.tsx`, `Night.module.css` |
| B clips-playback | `src/screens/MorningReveal.tsx`+css, `src/screens/ChatRich.tsx`+css, `src/screens/DetailedNight.tsx`+css |
| C dead-ends | `src/screens/Reorder.tsx`+css, `src/screens/Comparisons.tsx`+css, `src/screens/DeviceOverview.tsx`, `src/screens/Profile.tsx`, `src/App.tsx`, `src/components/TabBar.tsx`, `src/seed.ts` (Recommendation.sourceNightDate only), `scripts/seed-demo.mjs` (rec field + rerun) |
| D ml-scaffold | `src/lib/classifier.ts`, `package.json` (onnxruntime-web) |
| integrate | conflict resolution anywhere, final build |

Lane A calls Lane D's classifier through the interface in "Lane C — On-device ML
scaffold" above (import from `../lib/classifier`); Lane D creates that file without
touching the detector. Lane B's DetailedNight work also includes the honesty guards
from the audit (see Lane B item 2 in "Dead-screen fixes").

## Testing protocol (every phase, before declaring done)

1. `npm run build` green.
2. `node scripts/seed-demo.mjs` idempotent re-run green.
3. Browser walk (Chrome, phone viewport): demo account — Dashboard → Trends → Compare →
   Science → night detail → MorningReveal → Chat (send one message) → Reorder → Profile;
   then local-demo mode same walk; then Night screen live 60 s with real mic → End night →
   verify the new night renders with acoustic-only fields and no NaN/undefined/crash.
4. Empty-account test: fresh OTP user, zero nights — every screen renders a sane empty
   state, no crash.
