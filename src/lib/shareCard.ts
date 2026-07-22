// Partner share card — canvas-rendered PNG for Web Share Level 2 (Lane D,
// PLAN3.md). A 1080x1350 papercraft "night sky" summary built entirely from
// real state: last night's snore count, whether the partner slept through
// (an honest yes/no from Night.partnerSleptThrough, never invented), and a
// 7-night sparkline. Nothing here is demo/sample-labeled because nothing
// here is fabricated — if there's no last night, we render nothing and the
// caller (share.ts) falls back to the text/clipboard path.
//
// Brand tokens are hardcoded (BRAND.md "Night surfaces"/"Accents") rather
// than read from CSS custom properties: the card always commits to the
// night treatment (the app's primary surface) regardless of the viewer's
// current uiTheme — see BRAND.md "Dark is the primary brand surface".
// Papercraft hill silhouettes reuse the exact ridge paths from
// `components/paper/PaperScene.tsx` (SceneHills "low" variant) via Path2D,
// so the card's horizon matches the in-app card-footer motif exactly
// instead of a hand-rolled approximation.

import type { AppState, Night } from '../seed';
import { lastNight } from '../store';
import { fmtDuration } from '../utils/format';

const W = 1080;
const H = 1350;

const TOKENS = {
  bg0: '#0B1228',
  bg1: '#121B3A',
  bg2: '#1B2547',
  text1: '#F7F8FB',
  text2: '#B7BDD6',
  text3: '#7B83A8',
  hairline: 'rgba(183,189,214,0.16)',
  accent: '#4BAFBA',
  accentSoft: '#74C7D0',
  coral: '#E08A86', // --coral — the wordmark's period-moon, per Wordmark.tsx
  moonSky: '#DF7E77', // --scene-moon (night) — the decorative sky moon prop
  cream: '#EFE7DB',
  hillCoral: '#D97A78',
  hillCoralDeep: '#A05359',
  hillBack: '#1C2750',
  hillFront: '#161F44',
  floor: '#2A3252',
  navyEdge: 'rgba(61,70,111,0.55)',
  coralEdge: 'rgba(219,163,170,0.55)',
} as const;

// Moon path, lifted verbatim from components/Wordmark.tsx's crescent.
const MOON_PATH = 'M22 14.6A8.6 8.6 0 1 1 10.9 3.1a6.9 6.9 0 0 0 11.1 11.5Z';
// Four-point sparkle star, from PaperScene.tsx's PaperStar.
const STAR_PATH = 'M0 -5 Q1 -1 5 0 Q1 1 0 5 Q-1 1 -5 0 Q-1 -1 0 -5 Z';

// SceneHills "low" ridges (viewBox 360x56) — the card-footer horizon used
// throughout the app. Reused here so the share card's scenery is the exact
// same shape language, not a reinterpretation.
const HILL_LAYERS: Array<{ ridge: string; x0: number; x1: number; from: string; to: string; edge: string; band?: boolean }> = [
  {
    ridge: 'M0 44 Q30 26 62 30 Q95 36 125 32 Q160 26 195 34 Q235 42 270 36 Q305 28 335 32 Q352 35 360 34',
    x0: 0, x1: 360, from: TOKENS.hillCoralDeep, to: TOKENS.hillCoral, edge: TOKENS.coralEdge,
  },
  {
    ridge: 'M180 56 Q230 40 280 40 Q325 40 360 44',
    x0: 180, x1: 360, from: TOKENS.hillCoralDeep, to: TOKENS.hillCoral, edge: TOKENS.coralEdge,
  },
  {
    ridge: 'M0 40 Q40 34 80 40 Q130 48 180 46 Q240 43 290 47 Q330 50 360 47',
    x0: 0, x1: 360, from: TOKENS.hillBack, to: TOKENS.hillFront, edge: TOKENS.navyEdge,
  },
  {
    ridge: 'M0 50 Q90 48 180 50 Q270 52 360 50',
    x0: 0, x1: 360, from: TOKENS.floor, to: TOKENS.hillFront, edge: TOKENS.navyEdge, band: false,
  },
];
const HILL_VIEWBOX = { w: 360, h: 56 };

async function ensureFontsReady(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('600 28px "Quicksand"'),
      document.fonts.load('500 300px "Quicksand"'),
      document.fonts.load('800 60px "Nunito"'),
      document.fonts.load('900 60px "Baloo 2"'),
    ]);
    await document.fonts.ready;
  } catch {
    // Best-effort — if webfonts aren't ready in time the canvas falls back
    // to the platform default and the PNG still renders fine.
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Uppercase eyebrow labels use manual letter-spacing (portable across
 *  engines — `ctx.letterSpacing` isn't reliably supported everywhere yet). */
function drawSpacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacingPx: number): void {
  const widths = [...text].map(ch => ctx.measureText(ch).width);
  const total = widths.reduce((a, w) => a + w, 0) + spacingPx * Math.max(0, text.length - 1);
  let x = cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y);
    x += widths[i] + spacingPx;
  }
  ctx.textAlign = prevAlign;
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#141E3F');
  g.addColorStop(0.55, TOKENS.bg1);
  g.addColorStop(1, TOKENS.bg0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // faint teal glow, matching .screen.night's ambient radial wash
  const glow = ctx.createRadialGradient(W / 2, H * 0.28, 0, W / 2, H * 0.28, W * 0.75);
  glow.addColorStop(0, 'rgba(75,175,186,0.10)');
  glow.addColorStop(1, 'rgba(75,175,186,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function drawStars(ctx: CanvasRenderingContext2D): void {
  const stars: Array<[number, number, number]> = [
    [160, 150, 1.6], [360, 90, 2.1], [640, 170, 1.3],
    [860, 110, 1.9], [960, 220, 1.2], [220, 260, 1.1], [740, 260, 1.4],
  ];
  ctx.fillStyle = TOKENS.cream;
  const path = new Path2D(STAR_PATH);
  for (const [x, y, scale] of stars) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fill(path);
    ctx.restore();
  }
}

function drawMoon(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(W - 200, 150);
  ctx.scale(4.4, 4.4);
  ctx.filter = 'drop-shadow(0 6px 16px rgba(223,126,119,0.35))';
  ctx.fillStyle = TOKENS.moonSky;
  ctx.fill(new Path2D(MOON_PATH));
  ctx.restore();
  ctx.filter = 'none';
}

/** Card-footer horizon (SceneHills "low"), stretched to the card's full
 *  width and a fixed footer height — same four-pass papercut treatment
 *  (shadow, gradient body, occlusion band, lit crest edge) as the in-app
 *  component, just replayed on a 2D canvas instead of SVG. */
function drawHillFooter(ctx: CanvasRenderingContext2D, footerH: number): void {
  const sx = W / HILL_VIEWBOX.w;
  const sy = footerH / HILL_VIEWBOX.h;
  ctx.save();
  ctx.translate(0, H - footerH);
  ctx.scale(sx, sy);
  for (const layer of HILL_LAYERS) {
    const closed = `${layer.ridge} L${layer.x1} ${HILL_VIEWBOX.h} L${layer.x0} ${HILL_VIEWBOX.h} Z`;
    const fillPath = new Path2D(closed);
    const ridgePath = new Path2D(layer.ridge);

    // soft cast shadow
    ctx.save();
    ctx.filter = 'blur(2px)';
    ctx.fillStyle = 'rgba(6,10,28,0.35)';
    ctx.fill(fillPath);
    ctx.restore();

    const grad = ctx.createLinearGradient(0, 0, 0, HILL_VIEWBOX.h);
    grad.addColorStop(0, layer.from);
    grad.addColorStop(0.85, layer.to);
    ctx.fillStyle = grad;
    ctx.fill(fillPath);

    if (layer.band !== false) {
      ctx.save();
      ctx.clip(fillPath);
      ctx.save();
      ctx.translate(0, 4);
      ctx.filter = 'blur(2px)';
      ctx.strokeStyle = 'rgba(8,12,30,0.5)';
      ctx.lineWidth = 6;
      ctx.stroke(ridgePath);
      ctx.restore();
      ctx.restore();
    }

    ctx.strokeStyle = layer.edge;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.stroke(ridgePath);
  }
  ctx.restore();
}

function drawSparkline(ctx: CanvasRenderingContext2D, nights: Night[], x: number, y: number, w: number, h: number): void {
  const panelR = 28;
  ctx.fillStyle = TOKENS.bg2;
  roundRectPath(ctx, x, y, w, h, panelR);
  ctx.fill();
  ctx.strokeStyle = TOKENS.hairline;
  ctx.lineWidth = 2;
  roundRectPath(ctx, x, y, w, h, panelR);
  ctx.stroke();

  ctx.fillStyle = TOKENS.text3;
  ctx.font = '600 22px "Quicksand"';
  ctx.textBaseline = 'alphabetic';
  drawSpacedText(ctx, `${nights.length}-NIGHT TREND`, x + w / 2, y + 46, 5);

  if (nights.length < 2) {
    ctx.fillStyle = TOKENS.text2;
    ctx.font = '600 26px "Nunito"';
    ctx.textAlign = 'center';
    ctx.fillText('Keep tracking for a trend line.', x + w / 2, y + h / 2 + 10);
    ctx.textAlign = 'left';
    return;
  }

  const values = nights.map(n => n.totalSnores);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const padX = 56;
  const chartTop = y + 76;
  const chartH = h - 76 - 28;
  const chartW = w - padX * 2;
  const pts = values.map((v, i) => {
    const px = x + padX + (values.length === 1 ? chartW / 2 : (i / (values.length - 1)) * chartW);
    const py = chartTop + chartH - ((v - min) / range) * chartH;
    return [px, py] as const;
  });

  ctx.strokeStyle = TOKENS.accent;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.stroke();

  ctx.fillStyle = TOKENS.accentSoft;
  for (const [px, py] of pts) {
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWordmark(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 46px "Baloo 2"';
  const dr = 'Dr';
  const rest = 'Never Snore';
  const drW = ctx.measureText(dr).width;
  const moonW = 30;
  const gap = 6;
  const restW = ctx.measureText(rest).width;
  const total = drW + gap + moonW + gap + restW;
  let px = cx - total / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = TOKENS.text1;
  ctx.fillText(dr, px, y);
  px += drW + gap;

  ctx.save();
  ctx.translate(px, y - 34);
  ctx.scale(1.35, 1.35);
  ctx.fillStyle = TOKENS.coral;
  ctx.fill(new Path2D(MOON_PATH));
  ctx.restore();
  px += moonW + gap;

  ctx.fillStyle = TOKENS.accent;
  ctx.fillText(rest, px, y);
  ctx.textAlign = 'center';
}

/** Deterministic filename for the shared PNG. */
export function shareCardFileName(nightDate: string): string {
  return `dr-never-snore-${nightDate}.png`;
}

/**
 * Render the partner share card as a PNG Blob, or null if there's no real
 * night to summarize yet (share.ts falls back to the text/clipboard path
 * in that case — never a card with placeholder numbers).
 */
export async function renderShareCard(state: AppState): Promise<Blob | null> {
  const n = lastNight(state);
  if (!n) return null;
  if (typeof document === 'undefined') return null;

  await ensureFontsReady();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawBackground(ctx);
  drawStars(ctx);
  drawMoon(ctx);

  const footerH = 300;
  drawHillFooter(ctx, footerH);

  // ---- content column ----
  const cx = W / 2;
  ctx.textAlign = 'center';

  ctx.fillStyle = TOKENS.text3;
  ctx.font = '600 26px "Quicksand"';
  drawSpacedText(ctx, 'LAST NIGHT', cx, 300, 6);

  ctx.fillStyle = TOKENS.text1;
  ctx.font = '500 300px "Quicksand"';
  ctx.fillText(String(n.totalSnores), cx, 500);

  ctx.fillStyle = TOKENS.text2;
  ctx.font = '800 44px "Nunito"';
  ctx.fillText(n.totalSnores === 1 ? 'snore' : 'snores', cx, 550);

  const partnerLine = n.partnerSleptThrough
    ? `${state.partner.name} slept through`
    : `${state.partner.name} was woken`;
  ctx.fillStyle = TOKENS.text2;
  ctx.font = '700 40px "Nunito"';
  ctx.fillText(`${partnerLine} · ${fmtDuration(n.sleepDurationMin)} tracked`, cx, 630);

  const last7 = state.nights.slice(-7);
  drawSparkline(ctx, last7, 120, 700, W - 240, 340);

  drawWordmark(ctx, cx, H - footerH + 74);

  return await new Promise<Blob | null>(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}
