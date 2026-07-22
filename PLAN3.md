# Make It Real — Phase 3 Contract (chat wow, device journey, demo playback)

Builds on PLAN.md / PLAN2.md. Same non-negotiables: papercraft brand, honest data
(nothing fabricated presented as measured — demo/sample content always labeled),
RLS intact, no new heavy deps. `npm run build` green at Integrate; smoke walk green
at Verify.

## Lane A — Chat: coach with hands
Files: `src/utils/chatApi.ts`, `src/utils/coachPrompts.ts`, `src/screens/Chat.tsx`, `Chat.module.css`.

1. **Richer context**: buildDataContext additionally includes — graded insight sentences
   from `insights.ts` (only confidence != 'insufficient'), clip metadata for the latest
   night (`latestClips()`: count, peak dB, clock times — metadata only, never audio),
   device titration state (position, nights at position, deviceEffect delta), and the
   partner recap. Note wearable-pending fields honestly (already done — keep).
2. **Card tags**: the persona may embed at most ONE `{{card:trend}}`, `{{card:night:YYYY-MM-DD}}`,
   or `{{card:clip}}` token in a reply, only when the prose references that data. Client:
   after stream completes, strip tokens from the text and append the matching existing
   card renderer (`ChatCard` kinds already exist — extend with `clip`). `{{card:clip}}`
   renders the playable loudest-clip card (real clip if present; demo-sample in demo mode
   per Lane C; hidden if neither).
3. **Action chips**: persona may end a reply with `{{action:strap:N}}` (N = current ±1,
   1..5, only when the data context's titration summary supports it). Client renders a
   confirm chip "Move strap to position N" → on tap: `writeDevice({strapPosition: N})`,
   append a system-style chat line "Strap moved to position N", persist via chat write path.
   NEVER auto-apply; the chip must be tapped. Malformed/out-of-range tokens are dropped.
4. **Proactive morning line**: on Chat mount, if the latest night's date has no coach
   message on/after it, request one opener turn (normal streaming path, hidden user
   prompt "give the morning observation for the latest night") and persist it. Guard:
   at most once per night, account mode only, never while a night is recording.
5. **Dynamic suggestion chips**: derive 3 chips from data (wine effect exists → "How much
   does wine cost me?"; clips exist → "Play my loudest snore"; strap plateau → "Is the
   strap working?"; fallback to current static ones).
6. Visual polish: day dividers between chat sessions, timestamp on long-press or subtle
   inline, typing indicator keeps current style. No layout rework — refine, don't rebuild.

## Lane B — Device page: the titration journey
Files: `src/screens/DeviceOverview.tsx`, `DeviceOverview.module.css`, `src/utils/titration.ts` (new).

1. `titration.ts` (pure, over `Night[]` + device): `positionHistory(nights)` — segments of
   consecutive nights by strapPosition (recorded/demo nights carry strapPosition; seed data
   has the arc) with avg snores + snoreTimePct per segment; `titrationAdvice(nights, device)`
   — {recommendation: 'hold'|'advance'|'back-off', targetPosition, sentence, confidence}
   using deviceEffect/quietProgress logic (advance only on ≥7-night plateau at current
   position with snores above best-week baseline; back-off if peakDb/awake trend worsened
   after last advance). Honest: confidence-graded, 'insufficient' → "keep collecting nights".
2. Page sections (keep papercraft + existing diagram, add below it):
   - **Journey**: horizontal segment bar (one segment per position period, width ∝ nights,
     label = position, sub = avg snores) + a one-line delta story ("Position 1 → 3:
     snores down 68% since fitting").
   - **Next adjustment**: advice card with Dr. Sommers avatar + sentence; if
     recommendation != 'hold' and confidence != 'insufficient', an action button
     "Move to position N" → writeDevice + toast + a persisted coach chat line (same
     mechanism as Lane A's action chip — import from chatApi if exported, else local).
   - **Care**: cleaning cadence card (daily rinse / weekly deep-clean copy) + replacement
     projection: `fittedAt + lifespanNights` rendered as month/year, from real data.
   - Animate the diagram's position dot to `device.strapPosition` (CSS transition on the
     indicator position; positions 1..5 mapped along the strap).
3. The existing static callouts/specs stay — this page gets deeper, not replaced.

## Lane C — Demo/sample snore playback
Files: `scripts/gen-sample-snores.mjs` (new), `src/lib/clipRecorder.ts` (extend),
`src/screens/ChatRich.tsx`, `public/samples/` (new assets).

1. `gen-sample-snores.mjs`: Node script (no deps) that offline-renders 3 short (4–6 s)
   snore-like WAVs — layered 70–160 Hz sawtooth+noise bursts with breath envelopes
   (inhale rasp ~1.2 s, pause, repeat), distinct character per file (palatal rumble /
   tongue-base broadband / nasal flutter, per RESEARCH.md band definitions). Write to
   `public/samples/snore-1.wav` etc (~100-300 KB total). Run it; commit the WAVs.
2. `clipRecorder.ts`: add `demoClips(nightDate): SnoreClip[]` returning deterministic
   sample-backed clips (ts spread across that night's span, peakDb 58-64) with
   `isSample: true` on the SnoreClip type; `clipBlob()` for sample ids fetches the WAV.
   Real-capture behavior untouched.
3. Consumers (MorningReveal / DetailedNight / ChatRich / Chat's clip card) already call
   `latestClips()`/`clipBlob()` — extend the lookup seam so demo-mode nights with
   `source:'demo'` fall back to `demoClips()`. EVERY sample-backed playback UI shows a
   small "sample audio" caption — non-negotiable honesty rule. ChatRich's audio card
   caption updates accordingly.

## Lane D — Partner share card image
Files: `src/lib/shareCard.ts` (new), `src/lib/share.ts` (extend), `src/screens/Profile.tsx` (button only).

1. `shareCard.ts`: canvas-render a 1080×1350 papercraft summary card — night sky gradient
   (brand tokens), "N snores · {partner} slept through", 7-night sparkline, wordmark —
   from real state. Return a PNG Blob.
2. `share.ts`: `shareLastNight` attaches the image via Web Share Level 2 (`files`) when
   `navigator.canShare({files})`, else falls back to current text/clipboard path.
3. No new UI besides Profile's existing share button gaining the image.

## File ownership (parallel lanes — do not cross)
| Lane | Files |
|---|---|
| A chat | chatApi.ts, coachPrompts.ts, Chat.tsx, Chat.module.css |
| B device | DeviceOverview.tsx, DeviceOverview.module.css, titration.ts |
| C demo-clips | gen-sample-snores.mjs, clipRecorder.ts, ChatRich.tsx, public/samples/*, MorningReveal.tsx (caption only), DetailedNight.tsx (caption only) |
| D share-card | shareCard.ts, share.ts, Profile.tsx |
| integrate | anything, incl. seed-demo.mjs chat additions ("play my loudest snore" exchange) and cross-lane drift |

Lane A's clip card imports the Lane C seam by signature: `latestClips()`, `demoClips(date)`,
`clipBlob(id)`, `SnoreClip.isSample`. Lane B's chat-line persistence: use `writeChatMessage`
from sync.ts directly if chatApi's helper isn't exported.

## Adversary focus (after Integrate)
- **prompt-injection & action safety**: can crafted user text make the model emit
  `{{action:strap:5}}` jumps >±1, or the client apply without tap? Token parser fuzz.
- **honesty**: any sample audio or demo clip surface missing the "sample" label; any
  card/chip claiming data that isn't in context; proactive opener firing repeatedly or
  for stale nights.
- **regression + demo walk**: build, smoke script green; Chat/Device/Reveal walk on demo
  account renders rich (cards, journey bar, playable sample) with zero blanks/NaN.
