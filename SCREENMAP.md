# Dr. Never Snore — Screen Map & Interaction Inventory

Audited 2026-07-17. Every route × both themes screenshot-verified; every
interactive element traced to its handler. `[tab]` = reachable from the tab bar.

## Route map

| Route | Screen | Purpose |
|---|---|---|
| `/` | Dashboard | Home `[tab]` |
| `/dashboard/dark` | Dashboard | Legacy always-dark showcase alias |
| `/morning` | MorningReveal | Post-night reveal moment |
| `/chat` | Chat | Dr. Sommers live chat `[tab]` |
| `/chat/rich` | ChatRich | Canned rich night report |
| `/trends` | Trends | 30-night trends `[tab]` |
| `/trends/compare` | Comparisons | Cohort comparison |
| `/trends/science` | Science | Acoustic-fingerprint explainer |
| `/night` | Night | Live tracking (always night theme) |
| `/night/:date` | DetailedNight | Per-night detail (`today` = last night) |
| `/onboarding` | OnboardingQuestionnaire | 7-question triage |
| `/onboarding/findings` | Onboarding | Triage findings |
| `/onboarding/setup` | BoilAndBite | 5-step fitting flow |
| `/onboarding/device` | DeviceOverview | Device anatomy |
| `/profile` | Profile | Account + device + appearance `[tab]` |
| `/reorder` | Reorder | Commerce |
| `/demo` | Demo | Walkthrough staging `[tab]` |
| anything else | → redirect `/` | |

First-run gate: while `onboarding.complete === false`, every route redirects
to `/onboarding`. Both exits set `complete = true`: finishing the fitting
(BoilAndBite) **or** DeviceOverview's "take me home" CTA.

## Interaction inventory (all verified working)

- **Dashboard** — avatar → profile · Track sleep → `/night` · wine nudge
  (weekend evenings only) → chat · hero card → `/night/:date` · stat chips →
  trends · Where-you-are → device · message preview → chat · recommendation →
  reorder. Sarah card is intentionally static.
- **Trends** — range segmented (state) · chart card → comparisons.
- **Comparisons / Science** — back → trends; cohort chips toggle filters.
- **Chat** — back → home · ⋯ menu → rich report · suggestion chips send ·
  composer streams a live reply. Proactive opener dedupes against seeded copy.
- **ChatRich** — back → chat · ⋯ share/note (demo toasts) · audio play (toast)
  · composer is read-only and hands off to `/chat`.
- **Night** — auto-stages a 4h21m session · Start listening (mic detector) ·
  End night → computes the night → `/morning`.
- **MorningReveal** — single CTA → `/night/:date` (funnel by design; back
  from there → home).
- **DetailedNight** — back → home · ⋯ share/note toasts · `today` alias ·
  silent nights say "No snore events" instead of a bogus dB peak.
- **Profile** — device card → device · reorder row · partner toggle ·
  appearance segmented (Auto/Light/Dark; auto = dark after 6pm) · science row
  · re-fit → fitting · replay onboarding (re-enters gate) · sign-out (demo toast).
- **Reorder** — back → profile · ⋯ demo toasts · order button (idempotent,
  flips to teal Ordered) · remind toggle · ship-to Edit (demo toast).
- **Demo** — Simulate night → `/morning` · live tracking · replay onboarding ·
  reset seed · 12 quick jumps (all targets exist).
- **Onboarding** — triage advances per answer → findings → fitting (steps,
  pause/skip) → device → home. A re-fit no longer resets the seeded device story.

## Known intentional stubs (demo product)

Share/note/subscription/history/address/sign-out actions show explanatory
toasts rather than real integrations. `demo-fab` / `corner-link` CSS in
`globals.css` is currently unused (kept for the gallery page).
