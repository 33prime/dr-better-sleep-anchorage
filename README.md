# Dr. Better Sleep — Anchorage

Implementation of the **Anchorage** design direction (Direction 03) from the Dr. Better Sleep handoff. 14 iPhone 16 Pro screens, deployable as a static site.

## Run it

```bash
cd app
npm install
npm run dev      # local dev server with HMR
npm run build    # build to dist/
npm run preview  # preview the build
```

The site is plain HTML/CSS — Vite is just the dev server and bundler. Any static host (Vercel, Netlify, S3+CloudFront, GitHub Pages) will serve `dist/` directly.

## Structure

```
app/
├── index.html              gallery — all 14 screens at 0.55× scale, click-through
├── directions.html         the four design directions side-by-side
├── screens/
│   ├── _anchorage.css      shared design tokens + device frame
│   ├── 01-dashboard-light.html
│   ├── 02-dashboard-dark.html
│   ├── 03-morning-reveal.html
│   ├── 04-chat.html
│   ├── 05-trends.html
│   ├── 06-night.html
│   ├── 07-onboarding-triage.html
│   ├── 08-detailed-night.html
│   ├── 09-boil-and-bite.html
│   ├── 10-device-overview.html
│   ├── 11-chat-rich.html
│   ├── 12-comparisons.html
│   ├── 13-reorder.html
│   └── 14-science.html
├── package.json
└── README.md
```

Every screen is self-contained: open it directly in a browser at iPhone-16-Pro size (393×852) and it renders without the gallery shell.

## Design language

- **Display** — Instrument Serif (italic axis at scale)
- **UI** — Manrope (Geist substitute, Google-hosted)
- **Numerals** — JetBrains Mono Light
- **Day surface** — `#DDE2E2 → #D6DCDB` gradient with a breathing dawn glow
- **Night surface** — `#0B1416 → #060B0D` with a slower verdigris breath
- **Accent** — `#3E7565` deep verdigris / `#86C8B8` luminous verdigris
- **Hairlines** — `rgba(11,20,22,0.10)` day, `rgba(220,230,226,0.10)` night

All tokens live in `screens/_anchorage.css` as CSS custom properties on `:root`.

## Navigation

The screens are wired together by `screens/_router.js` so the prototype behaves like a real app — tab bars, back arrows, and the obvious tap targets all navigate. Edit the `config` object in `_router.js` to retarget anything; add `data-href="14-science.html"` to any element to make it navigable.

| From → tap                                 | Goes to                       |
| ------------------------------------------ | ----------------------------- |
| Dashboard (01/02) hero "Last Night"        | 08 Detailed night             |
| Dashboard (01/02) "Where you are" / Tonight | 10 Device overview            |
| Dashboard (01/02) Dr. Sommers message      | 04 Chat                       |
| Dashboard (01/02) Magnesium glycinate rec  | 13 Reorder                    |
| Dashboard tab bar                          | Home/Trends/Chat/Profile (01/05/04/13) |
| Morning reveal (03) "See the full night"   | 08 Detailed night             |
| Morning reveal (03) tap anywhere else      | 01 Dashboard                  |
| Trends (05) hero chart card                | 12 Comparisons                |
| Night (06) "End night"                     | 03 Morning reveal             |
| Night (06) "Device · Pos. 3" pill          | 10 Device overview            |
| Onboarding (07) "Start with this plan"     | 09 Boil & bite                |
| Onboarding (07) "Tell me more first"       | 10 Device overview            |
| Boil & bite (09) "Skip ahead"              | 10 Device overview            |
| Boil & bite (09) close (×)                 | 07 Onboarding                 |
| Back arrows                                | Previous screen via `history.back()` when same-origin, otherwise the configured fallback |

## Notes

- The screens use `prefers-reduced-motion` to disable the breathing animations on user preference.
- Screen 03 (morning reveal) auto-replays its animation sequence; tap the **REPLAY** chip in the top-right to watch it again.
- Screen 09 (boil & bite) has a live JS countdown in the timer ring.
- Click-throughs are disabled inside the gallery iframes (the gallery sets `pointer-events: none` so tiles act as previews); navigation only fires when a screen is opened full-size.
