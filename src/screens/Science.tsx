import { useLocation } from 'wouter';
import { useStore, lastNight, snoreTypeSeries, snoreFingerprintSimilarity } from '../store';
import { ChevronLeft } from '../components/icons';
import s from './Science.module.css';

export function Science() {
  const state = useStore();
  const [, navigate] = useLocation();

  const last = lastNight(state);
  const types = last?.snoreTypes ?? { palatal: 0.71, tongue: 0.22, nasal: 0.07 };
  const pct = (x: number) => Math.round(x * 100);
  const sim = snoreFingerprintSimilarity(state);
  const series = snoreTypeSeries(state, 14);

  return (
    <div className={s.root}>
      <div className={s.nav}>
        <button className={`${s.back} tap`} onClick={() => navigate('/trends')}>
          <ChevronLeft />
          <span>Trends</span>
        </button>
        <div className={s.badge}>On-device · {state.nights.length} nights</div>
      </div>

      <div className={s.body}>
        <div className={s.label}>The science</div>
        <h1 className={s.h}>
          Why <span className={s.it}>you</span> snore.<br />
          Specifically you.
        </h1>
        <p className={s.lede}>
          The mouthpiece holds your jaw. <span className={s.em}>Everything else</span> — what you ate, the room, the season, your weight — also moves the dial. After {state.nights.length} nights I can see your patterns clearly enough to name them.
        </p>

        <div className={s.finger}>
          <div className={s.top}>
            <div className={s.k}>Your acoustic fingerprint</div>
            <div className={s.ts}>Last 90 nights</div>
          </div>
          <div className={s.v}>
            <span className={s.pct}>{pct(types.palatal)}%</span>
            <span className={s.it}>soft palate</span> · low rumble, periodic
          </div>

          <div className={s.spec}>
            <Spectrogram />
            <span className={s.legend}>120 → 2000 Hz</span>
            <span className={s.freq}>Time →</span>
          </div>

          <div className={s.breakdown}>
            <div className={s.b}><div className={s.nm}>Soft palate</div><div className={s.pc}>{pct(types.palatal)}%</div><div className={s.desc}>Periodic, low rumble</div></div>
            <div className={s.b}><div className={s.nm}>Tongue base</div><div className={s.pc}>{pct(types.tongue)}%</div><div className={s.desc}>Wet, irregular</div></div>
            <div className={s.b}><div className={s.nm}>Nasal</div><div className={s.pc}>{pct(types.nasal)}%</div><div className={s.desc}>High flutter</div></div>
          </div>

          {series.length > 1 && (
            <div className={s.trendWrap}>
              <div className={s.trendHead}>
                <span className={s.trendK}>Type mix · last {series.length} nights</span>
                {sim !== null && <span className={s.sim}>{pct(sim)}% like your baseline</span>}
              </div>
              <TypeTrend series={series} />
              <div className={s.trendLegend}>
                <span><i style={{ background: 'var(--accent)' }} />Palatal</span>
                <span><i style={{ background: 'var(--accent-soft)' }} />Tongue</span>
                <span><i style={{ background: 'var(--warn)' }} />Nasal</span>
              </div>
            </div>
          )}

          <div className={s.reason}>
            Your soft palate vibrates when you exhale through a partly-closed airway. <span className={s.em}>That's the type the mouthpiece treats best</span> — which is why it's working.
          </div>
        </div>

        <h2 className={s.h2}>What's <span className={s.it}>moving the needle</span></h2>
        <p className={s.h2sub}>Patterns the on-device model has found in your data. None of these are causal proof — they're hypotheses worth testing.</p>

        <div className={s.find}>
          <div className={s.meta}>
            <div className={s.nm}>Alcohol within <span className={s.it}>3 hours of sleep</span></div>
            <div className={s.conf}>Strong · r = 0.71</div>
          </div>
          <div className={s.insight}>
            On the <span className={s.data}>23 nights</span> you logged a drink within three hours, your snore index averaged <span className={s.data}>2.3×</span> your baseline. <span className={s.em}>Two drinks pushes it to 3.1×.</span> The mouthpiece can't reach this — alcohol relaxes the same muscles the strap is fighting.
          </div>
        </div>

        <div className={s.find}>
          <div className={s.meta}>
            <div className={s.nm}>Bedroom <span className={s.it}>temperature</span></div>
            <div className={`${s.conf} ${s.med}`}>Moderate · r = 0.54</div>
          </div>
          <div className={s.insight}>
            Your sweet spot is <span className={s.data}>65–67°F</span>. Below 62 your nose dries out and you breathe through your mouth more; above 70 you sleep lighter and roll. <span className={s.em}>HomeKit can hold this for you</span> if you'd like.
          </div>
        </div>

        <div className={s.find}>
          <div className={s.meta}>
            <div className={s.nm}>Exercise <span className={s.it}>that day</span></div>
            <div className={`${s.conf} ${s.med}`}>Moderate · r = -0.48</div>
          </div>
          <div className={s.insight}>
            Days you hit <span className={s.data}>8,000+ steps</span> or 30 minutes of cardio, you snore <span className={s.data}>28% less</span> that night. <span className={s.em}>Within reason</span> — workouts after 8 p.m. spike your HR and undo the gain.
          </div>
        </div>

        <div className={s.find}>
          <div className={s.meta}>
            <div className={s.nm}>Pollen <span className={s.it}>count</span></div>
            <div className={s.conf}>Strong · r = 0.66</div>
          </div>
          <div className={s.insight}>
            Your nasal share triples on <span className={s.data}>high-pollen days</span> (oak in spring, ragweed in fall). It's the only signal where the device can't help — you'd want a saline rinse before bed and an antihistamine, if your doctor's onboard.
          </div>
        </div>

        <div className={`${s.find} ${s.flag}`}>
          <div className={s.meta}>
            <div className={s.nm}>Brief <span className={s.it}>silence-then-gasp</span> events</div>
            <div className={s.conf}>Worth flagging</div>
          </div>
          <div className={s.insight}>
            I've heard <span className={s.data}>14 events</span> across the last 90 nights that look like obstruction, not snoring — silence followed by a sharp inhale. <span className={s.em}>That's not enough to call apnea, but it's enough to mention.</span> If you want, I can package these for your GP or fax them straight to a sleep clinic.
          </div>
        </div>

        <p className={s.footnote}>
          All of this runs on your phone — your audio doesn't leave the device. CoreML 8 finds the patterns; I just translate them into something useful.
        </p>
      </div>
    </div>
  );
}

function TypeTrend({ series }: { series: Array<{ palatal: number; tongue: number; nasal: number }> }) {
  return (
    <div className={s.trend}>
      {series.map((t, i) => (
        <div key={i} className={s.trendBar}>
          <i style={{ height: `${t.palatal * 100}%`, background: 'var(--accent)' }} />
          <i style={{ height: `${t.tongue * 100}%`, background: 'var(--accent-soft)' }} />
          <i style={{ height: `${t.nasal * 100}%`, background: 'var(--warn)' }} />
        </div>
      ))}
    </div>
  );
}

function Spectrogram() {
  return (
    <svg viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="palatal" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#43BACA" stopOpacity="0.05" />
          <stop offset="20%" stopColor="#43BACA" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#43BACA" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#43BACA" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#43BACA" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <g transform="translate(0,8)">
        <rect width="320" height="20" fill="rgba(30,37,68,0.04)" />
        <g fill="url(#palatal)" opacity="0.35">
          <rect x="40" y="6" width="8" height="8" />
          <rect x="86" y="7" width="6" height="6" />
          <rect x="142" y="5" width="10" height="10" />
          <rect x="198" y="7" width="6" height="6" />
          <rect x="244" y="6" width="8" height="8" />
        </g>
      </g>
      <g transform="translate(0,34)">
        <rect width="320" height="22" fill="rgba(30,37,68,0.04)" />
        <g fill="url(#palatal)" opacity="0.55">
          <rect x="20" y="4" width="14" height="14" />
          <rect x="54" y="6" width="10" height="10" />
          <rect x="92" y="3" width="16" height="16" />
          <rect x="138" y="5" width="12" height="12" />
          <rect x="178" y="2" width="18" height="18" />
          <rect x="222" y="5" width="12" height="12" />
          <rect x="262" y="3" width="16" height="16" />
          <rect x="298" y="6" width="10" height="10" />
        </g>
      </g>
      <g transform="translate(0,62)">
        <rect width="320" height="26" fill="rgba(30,37,68,0.04)" />
        <g fill="#43BACA" opacity="0.92">
          <rect x="6" y="4" width="22" height="18" />
          <rect x="36" y="2" width="26" height="22" />
          <rect x="72" y="3" width="24" height="20" />
          <rect x="106" y="1" width="28" height="24" />
          <rect x="146" y="2" width="26" height="22" />
          <rect x="184" y="3" width="24" height="20" />
          <rect x="220" y="2" width="26" height="22" />
          <rect x="258" y="4" width="22" height="18" />
          <rect x="292" y="3" width="24" height="20" />
        </g>
      </g>
      <g transform="translate(0,94)">
        <rect width="320" height="22" fill="rgba(30,37,68,0.04)" />
        <g fill="url(#palatal)" opacity="0.7">
          <rect x="14" y="5" width="14" height="12" />
          <rect x="48" y="6" width="12" height="10" />
          <rect x="84" y="4" width="16" height="14" />
          <rect x="124" y="6" width="12" height="10" />
          <rect x="160" y="3" width="18" height="16" />
          <rect x="200" y="5" width="14" height="12" />
          <rect x="240" y="6" width="12" height="10" />
          <rect x="276" y="4" width="16" height="14" />
        </g>
      </g>
    </svg>
  );
}
