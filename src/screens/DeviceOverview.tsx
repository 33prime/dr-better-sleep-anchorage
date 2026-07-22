import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useStore } from '../store';
import { writeOnboarding, writeDevice, writeChatMessage } from '../lib/sync';
import { ChevronLeft, ArrowRight } from '../components/icons';
import { Menu } from '../components/Menu';
import { Wordmark } from '../components/Wordmark';
import { Avatar } from '../components/Avatar';
import { showToast } from '../components/Toast';
import { PaperStar, PaperCloud } from '../components/paper/PaperScene';
import { positionHistory, journeyStory, titrationAdvice, replacementProjection } from '../utils/titration';
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

  const segments = useMemo(() => positionHistory(state.nights), [state.nights]);
  const story = useMemo(() => journeyStory(segments), [segments]);
  const advice = useMemo(() => titrationAdvice(state.nights, state.device), [state.nights, state.device]);
  const replacement = useMemo(() => replacementProjection(state.device), [state.device]);

  const dotPosition = Math.min(5, Math.max(1, state.device.strapPosition || 1));
  const dotOffset = (dotPosition - 1) * 4; // strap track runs cy 113→129 across positions 1..5

  const canApplyAdvice = advice.recommendation !== 'hold' && advice.confidence !== 'insufficient';
  const applyAdvice = () => {
    const target = advice.targetPosition;
    writeDevice({ strapPosition: target });
    showToast(`Strap moved to position ${target}.`);
    writeChatMessage({ who: 'them', text: `Strap moved to position ${target}.` });
  };

  return (
    <div className={s.root}>
      <div className={s.nav}>
        <button className={`${s.back} tap`} onClick={() => navigate('/')}>
          <ChevronLeft />
          <span>Setup</span>
        </button>
        <Menu className={s.more} ariaLabel="More" items={[
          { label: 'Re-run fitting', onClick: () => navigate('/onboarding/setup') },
          { label: 'Adjustment guide', onClick: () => navigate('/onboarding/setup') },
        ]} />
      </div>

      <div className={s.body}>
        {/* night-only papercraft cluster tucked behind the header */}
        <svg viewBox="0 0 340 92" className={s.scene} aria-hidden focusable="false">
          <PaperStar x={214} y={22} scale={0.9} delay={0.6} />
          <PaperStar x={280} y={52} scale={0.6} delay={2.0} />
          <PaperStar x={312} y={26} scale={0.7} delay={1.2} />
          <PaperCloud x={244} y={40} scale={0.7} drift={2} />
        </svg>

        <div className={s.label}>Your device</div>
        <div style={{ margin: '3px 0 12px', position: 'relative' }}><Wordmark size={20} tone="auto" /></div>
        <h1 className={s.h}>
          Mandibular advancement <span className={s.it}>device.</span>
        </h1>

        <div className={s.diagram}>
          <svg viewBox="0 0 320 220" preserveAspectRatio="xMidYMid meet" aria-hidden>
            <ellipse className={s.dShadow} cx="160" cy="170" rx="115" ry="14" fill="rgba(30,37,68,0.06)" />
            <path d="M60,90 Q160,30 260,90 Q258,118 240,128 Q160,98 80,128 Q62,118 60,90 Z" fill="rgba(75,175,186,0.16)" stroke="#4BAFBA" strokeWidth={1.25} />
            <path d="M85,112 Q160,82 235,112" fill="none" stroke="#4BAFBA" strokeWidth={0.9} opacity="0.55" />
            <path className={`${s.dPaper} ${s.dInk}`} d="M70,118 Q160,170 250,118 Q252,150 232,160 Q160,178 88,160 Q68,150 70,118 Z" fill="rgba(255,255,255,0.6)" stroke="var(--text-primary)" strokeWidth={1} opacity="0.85" />
            <path className={s.dInk} d="M88,140 Q160,156 232,140" fill="none" stroke="var(--text-primary)" strokeWidth={0.6} opacity="0.5" />
            <rect className={`${s.dPaper} ${s.dInk}`} x="44" y="116" width="22" height="10" rx="3" fill="var(--bg-tertiary)" stroke="var(--text-primary)" strokeWidth={0.8} />
            <line className={s.dInk} x1="55" y1="113" x2="55" y2="129" stroke="var(--text-primary)" strokeWidth={0.6} />
            <rect className={`${s.dPaper} ${s.dInk}`} x="254" y="116" width="22" height="10" rx="3" fill="var(--bg-tertiary)" stroke="var(--text-primary)" strokeWidth={0.8} />
            <line className={s.dInk} x1="265" y1="113" x2="265" y2="129" stroke="var(--text-primary)" strokeWidth={0.6} />
            <circle className={s.dPaper} cx="160" cy="92" r="6" fill="#FFFFFF" stroke="#4BAFBA" strokeWidth={1} />
            <circle cx="160" cy="92" r="2" fill="#4BAFBA" />
            {/* Position indicator — animates along the right strap track (cy 113→129) as strapPosition changes */}
            <circle
              className={s.posDot}
              cx="265"
              cy="113"
              r="2.6"
              fill="#4BAFBA"
              style={{ transform: `translateY(${dotOffset}px)` }}
            />

            {/* Callout lines */}
            <g className={s.dInk} stroke="var(--text-primary)" strokeWidth={0.6} fill="none" opacity="0.5">
              <path d="M120,80 L40,40" />
              <path d="M180,168 L290,196" />
              <path d="M55,121 L18,128" />
              <path d="M160,92 L160,18" />
              <path d="M268,123 L304,90" />
            </g>

            <g fontFamily="Nunito" fontSize="10" fill="#4BAFBA">
              <circle className={s.dPaper} cx="40" cy="40" r="9" fill="#FFFFFF" stroke="#4BAFBA" />
              <text x="40" y="44" textAnchor="middle">1</text>
              <circle className={s.dPaper} cx="290" cy="196" r="9" fill="#FFFFFF" stroke="#4BAFBA" />
              <text x="290" y="200" textAnchor="middle">2</text>
              <circle className={s.dPaper} cx="18" cy="128" r="9" fill="#FFFFFF" stroke="#4BAFBA" />
              <text x="18" y="132" textAnchor="middle">3</text>
              <circle className={s.dPaper} cx="160" cy="14" r="9" fill="#FFFFFF" stroke="#4BAFBA" />
              <text x="160" y="18" textAnchor="middle">4</text>
              <circle className={s.dPaper} cx="304" cy="90" r="9" fill="#FFFFFF" stroke="#4BAFBA" />
              <text x="304" y="94" textAnchor="middle">5</text>
            </g>
          </svg>
          <div className={s.meta}><span>Top view</span><span>Pos. {state.device.strapPosition} of 5</span></div>
        </div>

        <div className={s.journey}>
          <div className={s.sectionLabel}>Journey</div>
          {segments.length > 0 ? (
            <>
              <div className={s.segBar}>
                {segments.map((seg, i) => (
                  <div
                    key={`${seg.position}-${seg.startDate}`}
                    className={`${s.seg} ${seg.position === dotPosition && i === segments.length - 1 ? s.segCurrent : ''}`}
                    style={{ flexGrow: seg.nightCount }}
                  >
                    <div className={s.segLabel}>Pos {seg.position}</div>
                    <div className={s.segSub}>{Math.round(seg.avgSnores)} avg</div>
                  </div>
                ))}
              </div>
              {story && <div className={s.story}>{story}</div>}
            </>
          ) : (
            <div className={s.story}>Keep collecting nights — the journey view fills in once titration data comes through.</div>
          )}
        </div>

        <div className={s.advice}>
          <div className={s.sectionLabel}>Next adjustment</div>
          <div className={s.adviceCard}>
            <Avatar size={34} />
            <div className={s.adviceBody}>
              <div className={s.adviceText}>{advice.sentence}</div>
              {canApplyAdvice && (
                <button className={`${s.adviceBtn} tap`} onClick={applyAdvice}>
                  Move to position {advice.targetPosition}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={s.callouts}>
          {CALLOUTS.map((c, i) => (
            <div className={s.co} key={i}>
              <div className={s.num}>{i + 1}</div>
              <div className={s.body}>
                <div className={s.name}>{c.name}</div>
                <div className={s.desc}>
                  {i === 4 ? (
                    <>Tiny dot on the right strap. Right now: <strong className={s.emph}>position {state.device.strapPosition} of 5</strong>.</>
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

        <div className={s.care}>
          <div className={s.sectionLabel}>Care</div>
          <div className={s.careCard}>
            <div className={s.careRow}>
              <div className={s.careK}>Daily rinse</div>
              <div className={s.careV}>Cool water after every night — never hot, it warps the silicone.</div>
            </div>
            <div className={s.careRow}>
              <div className={s.careK}>Weekly deep-clean</div>
              <div className={s.careV}>One cleaning tablet dissolved in cold water, once a week.</div>
            </div>
            {replacement && (
              <div className={s.careRow}>
                <div className={s.careK}>Replacement due</div>
                <div className={s.careV}>
                  <strong className={s.emph}>{replacement.label}</strong> — about {state.device.lifespanNights} nights from fitting.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={s.cta}>
          <button
            className={`${s.btn} tap`}
            onClick={() => {
              // This screen can end onboarding (findings → "skip to device");
              // without marking complete, the first-run gate would bounce the
              // user straight back to the questionnaire.
              writeOnboarding({ complete: true });
              navigate('/');
            }}
          >
            <span>Got it, take me home <ArrowRight /></span>
          </button>
        </div>
      </div>
    </div>
  );
}
