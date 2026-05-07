import { useLocation } from 'wouter';
import { useStore } from '../store';
import { ChevronLeft, DotsIcon, ArrowRight } from '../components/icons';
import s from './DeviceOverview.module.css';

const CALLOUTS = [
  { name: 'Upper tray', desc: 'Boil-and-bite silicone. Holds the impression of your upper teeth so the device stays put through the night.' },
  { name: 'Lower tray, slightly advanced', desc: 'Sits 4–8mm forward of natural rest. That gentle pull is what opens your airway — the whole point of the thing.' },
  { name: 'Adjustment strap', desc: "Two straps, one each side. They're how I titrate. You'll never need to crank them yourself — I'll tell you when." },
  { name: 'Breathing port', desc: "Lets you breathe through your mouth if your nose is blocked. Most users don't notice it after night two." },
  { name: 'Position indicator', desc: 'Tiny dot on the right strap. Right now your strap is at this position.' },
];

export function DeviceOverview() {
  const state = useStore();
  const [, navigate] = useLocation();

  return (
    <div className={s.root}>
      <div className={s.nav}>
        <button className={`${s.back} tap`} onClick={() => navigate('/')}>
          <ChevronLeft />
          <span>Setup</span>
        </button>
        <button className={`${s.more} tap`} aria-label="More"><DotsIcon /></button>
      </div>

      <div className={s.body}>
        <div className={s.label}>Your device</div>
        <h1 className={s.h}>
          Mandibular advancement <span className={s.it}>device.</span>
        </h1>

        <div className={s.diagram}>
          <svg viewBox="0 0 320 220" preserveAspectRatio="xMidYMid meet" aria-hidden>
            <ellipse cx="160" cy="170" rx="115" ry="14" fill="rgba(11,20,22,0.06)" />
            <path d="M60,90 Q160,30 260,90 Q258,118 240,128 Q160,98 80,128 Q62,118 60,90 Z" fill="rgba(134,200,184,0.16)" stroke="#3E7565" strokeWidth={1.25} />
            <path d="M85,112 Q160,82 235,112" fill="none" stroke="#3E7565" strokeWidth={0.9} opacity="0.55" />
            <path d="M70,118 Q160,170 250,118 Q252,150 232,160 Q160,178 88,160 Q68,150 70,118 Z" fill="rgba(255,255,255,0.6)" stroke="#0B1416" strokeWidth={1} opacity="0.85" />
            <path d="M88,140 Q160,156 232,140" fill="none" stroke="#0B1416" strokeWidth={0.6} opacity="0.5" />
            <rect x="44" y="116" width="22" height="10" rx="3" fill="#D4DAD9" stroke="#0B1416" strokeWidth={0.8} />
            <line x1="55" y1="113" x2="55" y2="129" stroke="#0B1416" strokeWidth={0.6} />
            <rect x="254" y="116" width="22" height="10" rx="3" fill="#D4DAD9" stroke="#0B1416" strokeWidth={0.8} />
            <line x1="265" y1="113" x2="265" y2="129" stroke="#0B1416" strokeWidth={0.6} />
            <circle cx="160" cy="92" r="6" fill="#DDE2E2" stroke="#3E7565" strokeWidth={1} />
            <circle cx="160" cy="92" r="2" fill="#3E7565" />
            <circle cx="265" cy="121" r="2" fill="#3E7565" />

            {/* Callout lines */}
            <g stroke="#0B1416" strokeWidth={0.6} fill="none" opacity="0.5">
              <path d="M120,80 L40,40" />
              <path d="M180,168 L290,196" />
              <path d="M55,121 L18,128" />
              <path d="M160,92 L160,18" />
              <path d="M268,123 L304,90" />
            </g>

            <g fontFamily="JetBrains Mono" fontSize="10" fill="#3E7565">
              <circle cx="40" cy="40" r="9" fill="#DDE2E2" stroke="#3E7565" />
              <text x="40" y="44" textAnchor="middle">1</text>
              <circle cx="290" cy="196" r="9" fill="#DDE2E2" stroke="#3E7565" />
              <text x="290" y="200" textAnchor="middle">2</text>
              <circle cx="18" cy="128" r="9" fill="#DDE2E2" stroke="#3E7565" />
              <text x="18" y="132" textAnchor="middle">3</text>
              <circle cx="160" cy="14" r="9" fill="#DDE2E2" stroke="#3E7565" />
              <text x="160" y="18" textAnchor="middle">4</text>
              <circle cx="304" cy="90" r="9" fill="#DDE2E2" stroke="#3E7565" />
              <text x="304" y="94" textAnchor="middle">5</text>
            </g>
          </svg>
          <div className={s.meta}><span>Top view</span><span>Pos. {state.device.strapPosition} of 5</span></div>
        </div>

        <div className={s.callouts}>
          {CALLOUTS.map((c, i) => (
            <div className={s.co} key={i}>
              <div className={s.num}>{i + 1}</div>
              <div className={s.body}>
                <div className={s.name}>{c.name}</div>
                <div className={s.desc}>
                  {i === 4 ? (
                    <>Tiny dot on the right strap. Right now: <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>position {state.device.strapPosition} of 5</strong>.</>
                  ) : c.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={s.specs}>
          <div className={s.s}><div className={s.k}>Material</div><div className={s.v}>Medical-grade silicone</div></div>
          <div className={s.s}><div className={s.k}>Adv. range</div><div className={s.v}>0 → 8 mm</div></div>
          <div className={s.s}><div className={s.k}>FDA</div><div className={s.v}>510(k) cleared, OTC</div></div>
          <div className={s.s}><div className={s.k}>Lifespan</div><div className={s.v}>~6 months</div></div>
        </div>

        <div className={s.cta}>
          <button className={`${s.btn} tap`} onClick={() => navigate('/')}>
            <span>Got it, take me home <ArrowRight /></span>
          </button>
        </div>
      </div>
    </div>
  );
}
