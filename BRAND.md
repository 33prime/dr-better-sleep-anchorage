# Dr. Never Snore — Brand Guide v2 · "Papercraft Night"

The July 2026 visual identity, extracted from the investor-demo mockups
(`01_home_dark.png` … `05_demo_dark.png`). This supersedes both the original
Anchorage handoff bundle (`../project/`) and the v1 flat-navy theme.

The idea: **a bedtime storybook made of cut paper.** Every screen is a night
sky over layered paper hills — a coral sun setting (or rising) between navy
ridges, pine trees on a teal hill, stars and clouds floating above. Clinical
sleep data delivered with the warmth of a children's book, because the product
lives on your nightstand, not in a lab.

---

## 1. Color

Dark is the primary brand surface (the app is used at night). **Day mode is a
"misty morning," not a lightened night** (per the official light mocks in
`~/Downloads/Dr. Better Sleep App/`): all scenery goes white paper with
slate-blue shading, pines go slate navy, the moon goes silver, the chart's
7-day average goes teal (`--chart-avg`), and only the sun keeps its coral.
UI accents (Sarah, coral CTAs, teal data) stay the same in both themes —
the palette flip is scenery-only.

### Night surfaces

| Token | Hex | Use |
|---|---|---|
| `--night-bg-0` | `#0B1228` | Deepest sky, page matte |
| `--night-bg-1` | `#121B3A` | Page base |
| `--night-bg-2` | `#1B2547` | Cards |
| `--night-bg-3` | `#242F58` | Raised elements, progress tracks |
| `--night-text-1` | `#F7F8FB` | Ink white — headlines, big numerals |
| `--night-text-2` | `#B7BDD6` | Body |
| `--night-text-3` | `#7B83A8` | Captions, axis labels |

### Accents

| Token | Hex | Use |
|---|---|---|
| `--accent` | `#4BAFBA` | **Teal — the data color.** Chart lines, positive deltas, toggles, progress, "listening" states |
| `--accent-soft` | `#74C7D0` | Teal on dark fills, sparkline glow |
| `--accent-deep` | `#35939F` | Filled teal pills (selected segment) |
| `--coral` | `#E08A86` | **Coral — the warmth color.** The sun/moon, Sarah, 7-day-avg lines, attention states, selected "Auto" pill |
| `--coral-soft` | `#F0B4AE` | Coral on light, day-mode hills |
| `--coral-deep` | `#D66A6C` | Filled coral chips |
| `--cream` | `#EFE7DB` | Stars, the streak moon |

**The two-accent rule:** teal carries data and interaction; coral carries
warmth and personality. They alternate across outlined chips, pills, and tab
underlines (see the Demo screen's quick-jump grid) — never mix both into one
element. Positive = teal, attention = coral; red/green never appear.

### Scene layers (`--scene-*`)

Papercraft shapes fill only with these tokens, defined per-theme in
`globals.css` (night values match the mocks; day values are the same
composition in pastel):

sun `#DF7E77` · sun ring `#C9655F` · hill back `#1C2750` · hill coral
`#D97A78` · hill teal `#29586B` · pine `#12203F` · hill front `#161F44` ·
cloud `#222C55` · star = cream.

## 2. Typography

Three rounded faces, one warm voice (all Google Fonts, loaded in `index.html`):

| Role | Face | Weights | Use |
|---|---|---|---|
| Display (`--serif` alias) | **Baloo 2** | 600–800 | Headlines ("Good morning, Matt."), card titles, buttons that greet |
| Body / UI (`--sans`) | **Nunito** | 400–800 | Everything conversational |
| Data (`--mono` alias) | **Quicksand** | 400–600 | Big numerals (0, 90, 6:47), tick labels, letter-spaced eyebrows |

Big numerals are **light** (Quicksand 400–500 at 64–76px) — the data whispers,
the words smile. Eyebrow labels (`LAST NIGHT`, `SNORING · 30 NIGHTS`) are
Quicksand 500–600, 9–10px, `letter-spacing: 0.22em`, uppercase, `text-3` color.

Chat (Dr. Sommers) is lowercase, plain-spoken, numbers inline: *"quiet one
last night — 0 snores, under your 94 baseline."*

## 3. The papercraft motif

The signature element. Rules:

- **Layers stack back-to-front**, and every hill layer gets the four-pass
  papercut treatment (decompiled from the mocks, implemented in `HillLayer`):
  1. a soft cast shadow bleeding onto the layer behind (blurred silhouette),
  2. a body gradient that **lightens toward the base** (deep shade at the
     crest → light at the foot),
  3. a dark occlusion band hugging the inside of the crest (blurred stroke,
     clipped to the shape),
  4. a thin lit crest edge following the contour (`--scene-*-edge` tokens).
  Small props (clouds, pines, sun) keep the simpler drop-shadow treatment
  (`0 4–6px 6–10px rgba(4,8,24,0.35–0.45)`).
- **A lit floor strip** (`--scene-floor` with a navy-edge highlight) grounds
  every dune range.
- **Where it lives:** home header horizon (`HeroScene`), chart/card footers
  (`SceneHills`), avatars (mini-scene badge), Trends/Demo headers. Decorative
  only — always `aria-hidden`, never carries data.
- **Restraint:** one scene per screen. Cards stay quiet (flat navy, 16–24px
  radius, hairline borders) so the horizon can sing.
- **Motion:** clouds drift ±7px over 14–18s, stars twinkle opacity 0.55→1.
  Both disabled under `prefers-reduced-motion`.

Components live in `src/components/paper/PaperScene.tsx`
(`HeroScene`, `SceneHills` — `variant="grand"` for chart floors,
`variant="low"` for compact card footers — plus `PaperSun`, `PaperMoon`,
`PaperCloud`, `PaperStar`, `PaperPine`).

## 4. Component idioms

- **Cards:** `--night-bg-2` fill, 16–24px radius, 1px `--hairline-night`
  border. No gradients inside cards.
- **Pills & chips:** fully rounded (999px). Outlined by default (1px teal or
  coral border, transparent fill); filled (`--accent-deep` / `--coral-deep`,
  white text) only when selected.
- **Charts:** nightly line = teal with dot terminals; 7-day average = dashed
  coral; axis labels = spaced Quicksand caps. Hills may rise behind a chart's
  baseline (fun sits *behind* data, never on it).
- **Tab bar:** 5 tabs (Home · Trends · Chat · Profile · Demo). Active tab gets
  a 26×3px rounded underline — teal, or coral via `data-accent="coral"`
  (Profile, Demo). Chat carries a teal unread dot.
- **Toggles:** teal when on, white knob.

## 5. Voice

Warm clinician, lowercase in chat, always concrete ("↓ 39% vs. range first
half", never "great job!"). Sarah — the partner who finally sleeps — is the
emotional proof point and gets coral. The device is "Dr 🌙 Never Snore".
