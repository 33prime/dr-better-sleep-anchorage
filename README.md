# Dr. Better Sleep — Anchorage

A functional demo web app implementation of the Anchorage design direction. 14 iPhone 16 Pro screens, wired together as a single SPA with persistent state, real interactivity, and the kind of feel you'd want for a believable demo.

## Run it

```bash
cd app
npm install
npm run dev      # local dev with HMR (http://localhost:5173)
npm run build    # type-check + bundle to dist/
npm run preview  # preview the production build
```

## What's actually working

- **Persistent device shell** — the device frame, status bar (live clock), and tab bar mount once and stay; only the inner content swaps between routes.
- **Hash router** with View Transitions API — slide-left for forward, slide-right for back, fade for tab switches. Reduced-motion respected.
- **Reactive store** persisted to localStorage — tweaks survive reload.
- **30 nights of mock data** with a clear "device fitted" inflection 21 days ago: snore counts trending down, deep sleep up, HRV improving.
- **Dashboard** — hero number animates from 0, sparkline draws in, status row ticks. Hero card opens that night's detail; "Where you are" opens the device overview; agent message opens the chat thread; recommendation opens reorder.
- **Pull-to-refresh** on the dashboard scroll area — simulates a new night and routes through the morning reveal.
- **Chat** — type a message, hit send (or Enter), Dr. Sommers types and replies after a delay. Pattern-matched replies for keywords like *alcohol*, *strap position*, *temperature*; thoughtful defaults otherwise.
- **Trends** — 7d / 30d / 90d / All chips re-render the chart and headline. Tap the chart to deep-dive into comparisons.
- **Detailed night** — `/night/:date` pulls that night's hypnogram totals, snore intensity bars, and position breakdown from the store.
- **Onboarding flow** — `/onboarding` → boil & bite → device overview. Boil & bite is a real 5-step state machine with a per-step countdown ring; auto-advances and chimes on completion.
- **Reorder** — primary CTA flips to a confirmation state on tap; "remind me in 3 months" toggle has a real animated knob.
- **Demo controls** (gear icon, bottom-right) — simulate a new night, jump to live tracking, replay onboarding, force light/dark, quick-jump to any tab, full reset.
- **Auto theme** — dashboard switches to dark after 6pm.

## Structure

```
app/
├── index.html              SPA entry — boots /src/main.ts
├── gallery.html            design overview (the previous index, all 14 screens at 0.55× scale)
├── directions.html         the four design directions side-by-side
├── netlify.toml            Netlify build config
├── public/
│   └── screens/            templates served as-is (also work standalone for the gallery iframes)
│       ├── _anchorage.css  shared design tokens + device frame
│       └── 01..14-*.html   one HTML page per screen
├── src/
│   ├── main.ts             boot — mount shell, install delegation, run router
│   ├── router.ts           hash router with View Transitions
│   ├── shell.ts            device frame + status bar + tap-feedback delegation
│   ├── store.ts            reactive store with localStorage persistence
│   ├── seed.ts             mock data factory (30 nights of plausible data)
│   ├── screens.ts          per-screen hydrators
│   ├── replies.ts          canned Dr. Sommers replies
│   ├── animate.ts          tickNumber, drawPath, pull-to-refresh
│   ├── charts.ts           SVG path generators
│   ├── format.ts           date/time/number formatters
│   ├── toast.ts            tiny toast helper
│   └── demo.ts             demo control panel
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Routes

| Hash                  | Screen                  |
| --------------------- | ----------------------- |
| `#/`                  | Dashboard (light or dark by time-of-day) |
| `#/morning`           | Morning reveal          |
| `#/chat`              | Chat                    |
| `#/chat/rich`         | Chat with rich data     |
| `#/trends`            | Trends                  |
| `#/trends/compare`    | Comparisons             |
| `#/trends/science`    | The science             |
| `#/night`             | Live night tracking     |
| `#/night/:date`       | Detailed night          |
| `#/onboarding`        | Onboarding triage       |
| `#/onboarding/setup`  | Boil & bite             |
| `#/onboarding/device` | Device overview         |
| `#/profile`           | Reorder (acting as profile) |

## Demo path (5 minutes)

1. Land on the dashboard → hero number ticks up, sparkline draws in.
2. Tap "Last night" hero → detailed night with hypnogram, snore intensity, position breakdown.
3. Back → tap the message preview → chat. Type "why does alcohol matter?" — get a real reply.
4. Bottom tab → Trends. Toggle 7d / 30d / 90d.
5. Bottom tab → Profile (reorder). Tap "Reorder one device" → ordered.
6. Pull down on dashboard → simulates a new night, lands on morning reveal.
7. Open the gear icon → "Replay onboarding" → walk through boil & bite (each step has a real countdown).

## Deploy

`netlify.toml` is pre-configured for `npm run build` → `dist/`. Push to GitHub, connect the repo on Netlify, deploys are automatic. Or drag the `dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop) after building locally.
