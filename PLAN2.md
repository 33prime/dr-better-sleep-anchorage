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

## Testing protocol (every phase, before declaring done)

1. `npm run build` green.
2. `node scripts/seed-demo.mjs` idempotent re-run green.
3. Browser walk (Chrome, phone viewport): demo account — Dashboard → Trends → Compare →
   Science → night detail → MorningReveal → Chat (send one message) → Reorder → Profile;
   then local-demo mode same walk; then Night screen live 60 s with real mic → End night →
   verify the new night renders with acoustic-only fields and no NaN/undefined/crash.
4. Empty-account test: fresh OTP user, zero nights — every screen renders a sane empty
   state, no crash.
