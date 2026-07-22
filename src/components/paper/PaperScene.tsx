import { useId, type CSSProperties } from 'react';

/* Papercraft scene kit — the brand's signature element (see app/BRAND.md).
   Every shape fills with a --scene-* token, so scenes render pastel on the
   day theme and deep navy/coral on night without any props. Layer shadows
   are soft and fall downward, like stacked cut paper. */

const shadow = {
  back:  'drop-shadow(0 3px 4px rgba(4,8,24,0.25))',
  mid:   'drop-shadow(0 4px 6px rgba(4,8,24,0.35))',
  front: 'drop-shadow(0 5px 8px rgba(4,8,24,0.45))',
  sun:   'drop-shadow(0 6px 16px rgba(223,126,119,0.35))',
};

interface PlacedProps { x: number; y: number; scale?: number; delay?: number }

/* Four-point sparkle star, ~10px tall at scale 1 */
export function PaperStar({ x, y, scale = 1, delay = 0 }: PlacedProps) {
  return (
    <path
      d="M0 -5 Q1 -1 5 0 Q1 1 0 5 Q-1 1 -5 0 Q-1 -1 0 -5 Z"
      transform={`translate(${x} ${y}) scale(${scale})`}
      className="paper-twinkle"
      style={{ fill: 'var(--scene-star)', animationDelay: `${delay}s` }}
    />
  );
}

/* Puffy cloud, ~64x22 at scale 1, flat paper bottom */
export function PaperCloud({ x, y, scale = 1, drift = 1 }: PlacedProps & { drift?: 1 | 2 | 0 }) {
  const driftClass = drift === 0 ? '' : drift === 1 ? 'paper-drift' : 'paper-drift2';
  return (
    /* placement transform lives on the outer <g>; the drift animation animates
       CSS transform on the inner <g>, which would otherwise override it */
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={driftClass}>
        <path
          d="M9 22 a9 9 0 0 1 2-17 a12 12 0 0 1 22-4 a10 10 0 0 1 16 5 a8 8 0 0 1 4 16 Z"
          style={{ fill: 'var(--scene-cloud)', filter: shadow.back }}
        />
        {/* lit paper edge along the puffs */}
        <path
          d="M9 22 a9 9 0 0 1 2-17 a12 12 0 0 1 22-4 a10 10 0 0 1 16 5 a8 8 0 0 1 4 16"
          fill="none" strokeWidth={1.2} opacity={0.35}
          style={{ stroke: 'var(--scene-navy-edge)' }}
        />
      </g>
    </g>
  );
}

/* Crescent moon, ~22px at scale 1 */
export function PaperMoon({ x, y, scale = 1 }: PlacedProps) {
  return (
    <path
      d="M21 12.8 A9 9 0 1 1 11.2 3 A7 7 0 0 0 21 12.8 Z"
      transform={`translate(${x} ${y}) scale(${scale})`}
      style={{ fill: 'var(--scene-moon)', filter: shadow.mid }}
    />
  );
}

/* Three-tier pine, 16x24 at scale 1, anchored at its base center.
   `sx` narrows the silhouette (the mocks' pines are slim). */
export function PaperPine({ x, y, scale = 1, sx }: PlacedProps & { sx?: number }) {
  return (
    <path
      d="M0 -24 L5 -16 L3 -16 L6.5 -9 L4.5 -9 L8 -2 L1 -2 L1 0 L-1 0 L-1 -2 L-8 -2 L-4.5 -9 L-6.5 -9 L-3 -16 L-5 -16 Z"
      transform={`translate(${x} ${y}) scale(${sx ?? scale} ${scale})`}
      style={{ fill: 'var(--scene-pine)' }}
    />
  );
}

/* Rising paper sun: concentric coral rings */
export function PaperSun({ x, y, scale = 1 }: PlacedProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} style={{ filter: shadow.sun }}>
      <circle r="44" style={{ fill: 'var(--scene-sun)' }} />
      <circle r="27" style={{ fill: 'var(--scene-sun-ring)' }} />
      <circle r="13" style={{ fill: 'var(--scene-sun)' }} />
    </g>
  );
}

/* ============================================================
   HeroScene — the home-screen horizon (393x150). The sun rises
   between a coral ridge and the navy foreground; a teal forested
   hill anchors the right edge. Decorative only.
   ============================================================ */
export function HeroScene({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 393 150"
      preserveAspectRatio="none"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
      aria-hidden
      focusable="false"
    >
      <PaperStar x={58} y={38} scale={1} delay={0.4} />
      <PaperStar x={128} y={22} scale={1.25} delay={1.6} />
      <PaperStar x={236} y={44} scale={0.9} delay={2.5} />
      <PaperStar x={318} y={20} scale={1.1} delay={0.9} />
      <PaperStar x={368} y={58} scale={0.85} delay={3.2} />

      <PaperCloud x={214} y={22} scale={1.3} drift={1} />
      <PaperCloud x={298} y={64} scale={1} drift={2} />
      <PaperCloud x={66} y={32} scale={0.95} drift={2} />

      <PaperSun x={144} y={114} scale={0.9} />

      {/* back navy hills, full width — higher mass on the left */}
      <HillLayer
        ridge="M0 92 Q55 78 118 98 Q190 120 258 100 Q330 84 393 96"
        x1={393} floorY={150}
        from="var(--scene-hill-back)" to="var(--scene-hill-front)" edge="var(--scene-navy-edge)"
        castShadow={false}
      />
      {/* coral ridge ribbon — prominent on the left */}
      <HillLayer
        ridge="M0 112 Q50 98 110 112 Q170 128 240 118 Q300 108 393 122"
        x1={393} floorY={150}
        from="var(--scene-hill-coral-deep)" to="var(--scene-hill-coral)" edge="var(--scene-coral-edge)"
      />
      {/* teal forested hill, right */}
      <g>
        <HillLayer
          ridge="M198 150 Q258 106 330 112 Q368 115 393 102"
          x0={198} x1={393} floorY={150}
          from="var(--scene-hill-teal-deep)" to="var(--scene-hill-teal)" edge="var(--scene-teal-edge)"
        />
        <g style={{ filter: shadow.back }}>
          <PaperPine x={306} y={128} scale={1.1} sx={0.8} />
          <PaperPine x={330} y={124} scale={1.35} sx={0.95} />
          <PaperPine x={356} y={128} scale={1} sx={0.75} />
        </g>
      </g>
      {/* front navy ridge */}
      <HillLayer
        ridge="M0 132 Q80 116 160 128 Q240 140 320 126 Q360 119 393 128"
        x1={393} floorY={150}
        from="var(--scene-hill-back)" to="var(--scene-hill-front)" edge="var(--scene-navy-edge)"
      />
    </svg>
  );
}

/* ============================================================
   HillLayer — one sheet of cut paper, with real depth.
   Decompiled from the mocks, each layer is four passes:
     1. a soft cast shadow bleeding onto the layer behind
     2. the body, a vertical gradient that LIGHTENS toward the base
     3. a dark occlusion band hugging the inside of the crest
     4. a thin lit crest edge following the contour
   `ridge` is the open crest path (must start at x=x0 and end at x=x1);
   the body is closed down to `floorY` automatically.
   ============================================================ */
function HillLayer({
  ridge, x0 = 0, x1 = 360, floorY = 80, from, to, edge,
  band = true, castShadow = true,
}: {
  ridge: string;
  x0?: number; x1?: number; floorY?: number;
  from: string;   // gradient top (darker)
  to: string;     // gradient bottom (lighter)
  edge: string;   // crest highlight color
  band?: boolean;
  castShadow?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const d = `${ridge} L${x1} ${floorY} L${x0} ${floorY} Z`;
  return (
    <g>
      <defs>
        <linearGradient id={`hg${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: from }} />
          <stop offset="85%" style={{ stopColor: to }} />
        </linearGradient>
        <clipPath id={`hc${uid}`}><path d={d} /></clipPath>
      </defs>
      {castShadow && (
        <path d={d} style={{ fill: 'var(--scene-shadow)', filter: 'blur(5px)' }} />
      )}
      <path d={d} fill={`url(#hg${uid})`} />
      {band && (
        <g clipPath={`url(#hc${uid})`}>
          {/* occlusion: the crest's own shadow curling onto the sheet below it */}
          <path
            d={ridge} fill="none" strokeWidth={17}
            transform="translate(0 8)"
            style={{ stroke: 'var(--scene-occlusion)', filter: 'blur(5px)' }}
          />
        </g>
      )}
      <path d={ridge} fill="none" stroke={edge} strokeWidth={1.1} opacity={0.55} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/* ============================================================
   SceneHills — the dune range for chart/card floors (360x80).
   Layer stack decompiled from mock 02: one continuous coral
   range with three summits, a deep-coral mound in the saddle,
   a second deep ridge on the right, a navy dune sweeping the
   front with pines on its left crest, and a lit floor strip.
   ============================================================ */
export function SceneHills({ className, style, variant = 'grand' }: { className?: string; style?: CSSProperties; variant?: 'grand' | 'low' }) {
  if (variant === 'low') {
    return (
      <svg
        viewBox="0 0 360 56"
        preserveAspectRatio="none"
        className={className}
        style={{ display: 'block', width: '100%', height: '100%', ...style }}
        aria-hidden
        focusable="false"
      >
        {/* low rolling coral chain */}
        <HillLayer
          ridge="M0 44 Q30 26 62 30 Q95 36 125 32 Q160 26 195 34 Q235 42 270 36 Q305 28 335 32 Q352 35 360 34"
          floorY={56}
          from="var(--scene-hill-coral-deep)" to="var(--scene-hill-coral)" edge="var(--scene-coral-edge)"
        />
        {/* deep coral ridge, right */}
        <HillLayer
          ridge="M180 56 Q230 40 280 40 Q325 40 360 44"
          x0={180} floorY={56}
          from="var(--scene-hill-coral-deep)" to="var(--scene-hill-coral)" edge="var(--scene-coral-edge)"
        />
        {/* navy dune in front */}
        <HillLayer
          ridge="M0 40 Q40 34 80 40 Q130 48 180 46 Q240 43 290 47 Q330 50 360 47"
          floorY={56}
          from="var(--scene-hill-back)" to="var(--scene-hill-front)" edge="var(--scene-navy-edge)"
        />
        <g style={{ filter: shadow.back }}>
          <PaperPine x={10} y={38} scale={0.85} sx={0.6} />
          <PaperPine x={26} y={35} scale={1.05} sx={0.72} />
          <PaperPine x={41} y={39} scale={0.75} sx={0.55} />
        </g>
        {/* lit floor strip */}
        <HillLayer
          ridge="M0 50 Q90 48 180 50 Q270 52 360 50"
          floorY={56}
          from="var(--scene-floor)" to="var(--scene-hill-front)" edge="var(--scene-navy-edge)"
          band={false}
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 360 100"
      preserveAspectRatio="none"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
      aria-hidden
      focusable="false"
    >
      {/* distant deep-coral mound — peeks out of the saddle from BEHIND */}
      <HillLayer
        ridge="M100 80 Q135 40 170 46 Q192 50 212 62"
        x0={100} x1={212} floorY={100}
        from="var(--scene-hill-coral-deep)" to="var(--scene-hill-coral-deep)" edge="var(--scene-coral-edge)"
        castShadow={false}
      />
      {/* coral range — three broad summits, long smooth saddles */}
      <HillLayer
        ridge="M0 72 Q20 68 40 52 Q58 24 80 22 Q100 21 118 36 Q134 50 150 52 Q166 53 180 34 Q192 18 205 17 Q222 17 238 34 Q252 50 268 48 Q286 44 305 30 Q322 20 338 26 Q352 32 360 42"
        floorY={100}
        from="var(--scene-hill-coral-deep)" to="var(--scene-hill-coral)" edge="var(--scene-coral-edge)"
      />
      {/* second coral ridge rising across the right half */}
      <HillLayer
        ridge="M205 92 Q245 62 285 50 Q322 42 348 50 Q357 54 360 55"
        x0={205} floorY={100}
        from="var(--scene-hill-coral-deep)" to="var(--scene-hill-coral)" edge="var(--scene-coral-edge)"
      />
      {/* navy dune sweeping the front — a round hillock at the left carries the pines */}
      <HillLayer
        ridge="M0 46 Q18 36 42 36 Q68 38 88 50 Q112 62 135 68 Q165 75 200 73 Q245 70 275 74 Q315 80 360 75"
        floorY={100}
        from="var(--scene-hill-back)" to="var(--scene-hill-front)" edge="var(--scene-navy-edge)"
      />
      {/* slate hillock carrying the pines */}
      <HillLayer
        ridge="M0 60 Q22 42 48 48 Q76 57 104 62"
        x0={0} x1={104} floorY={100}
        from="var(--scene-mound)" to="var(--scene-hill-front)" edge="var(--scene-navy-edge)"
      />
      {/* slim pines standing tall on the hillock, clearly separated */}
      <g style={{ filter: shadow.back }}>
        <PaperPine x={10} y={44} scale={1.7} sx={1.05} />
        <PaperPine x={40} y={40} scale={2.2} sx={1.25} />
        <PaperPine x={68} y={47} scale={1.5} sx={0.95} />
      </g>
      {/* lit floor strip along the base */}
      <HillLayer
        ridge="M0 90 Q90 88 180 90 Q270 92 360 90"
        floorY={100}
        from="var(--scene-floor)" to="var(--scene-hill-front)" edge="var(--scene-navy-edge)"
        band={false}
      />
    </svg>
  );
}
