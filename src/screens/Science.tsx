import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore, lastNight, snoreTypeSeries, snoreFingerprintSimilarity } from '../store';
import { wineEffect } from '../utils/insights';
import { ChevronLeft } from '../components/icons';
import s from './Science.module.css';

// The three snore types, their vibration sites, and their acoustic bands —
// the same band edges the live detector classifies with (useSnoreDetector),
// grounded in the band→site mapping literature (see SOURCES below).
const TYPES = [
  {
    key: 'palatal' as const,
    name: 'Palatal',
    site: 'Soft palate',
    loHz: 60, hiHz: 300,
    character: 'A periodic low rumble — the classic snore. The soft palate flutters as air squeezes past on each breath.',
    device: 'The type the mouthpiece treats best: advancing the jaw tightens the tissue that flutters.',
    sample: '/samples/snore-1.wav',
  },
  {
    key: 'tongue' as const,
    name: 'Tongue base',
    site: 'Back of the tongue',
    loHz: 300, hiHz: 1000,
    character: 'Broadband and irregular — a wetter, rougher sound. The tongue falls back and narrows the airway.',
    device: 'Also squarely in the mouthpiece’s reach — jaw advancement pulls the tongue base forward with it.',
    sample: '/samples/snore-2.wav',
  },
  {
    key: 'nasal' as const,
    name: 'Nasal',
    site: 'Nasal passages',
    loHz: 1000, hiHz: 3000,
    character: 'A high, whistling flutter. Air forced through a congested or narrow nose.',
    device: 'The one the mouthpiece can’t fix — breathing strips or a saline rinse are the right tools here.',
    sample: '/samples/snore-3.wav',
  },
];

const BAND_MAX_HZ = 3000;

export function Science() {
  const state = useStore();
  const [, navigate] = useLocation();

  const last = lastNight(state);
  const types = last?.snoreTypes ?? { palatal: 0, tongue: 0, nasal: 0 };
  const pct = (x: number) => Math.round(x * 100);
  const sim = snoreFingerprintSimilarity(state);
  const series = snoreTypeSeries(state, 14);
  const wine = wineEffect(state.nights);

  const dominant = TYPES.reduce((a, b) => (types[b.key] > types[a.key] ? b : a), TYPES[0]);

  // One shared audio element; tapping a row plays that type's sample.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const togglePlay = (key: string, src: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => setPlaying(null));
      audioRef.current.addEventListener('error', () => setPlaying(null));
    }
    const a = audioRef.current;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    a.src = src;
    a.play().then(() => setPlaying(key)).catch(() => setPlaying(null));
  };

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
          Every snore says<br /><span className={s.it}>where it came from.</span>
        </h1>
        <p className={s.lede}>
          A snore is tissue vibrating somewhere in your airway — and each place vibrates at its
          own frequencies. That's how the app can tell <span className={s.em}>what kind</span> of
          snorer you are from sound alone, and why it matters for the device.
        </p>

        {/* ---- Three snores, three places — listen to each ---- */}
        <div className={s.types}>
          {TYPES.map(t => (
            <div key={t.key} className={`${s.type} ${playing === t.key ? s.playing : ''}`}>
              <div className={s.typeHead}>
                <button
                  className={`${s.play} tap`}
                  onClick={() => togglePlay(t.key, t.sample)}
                  aria-label={playing === t.key ? `Pause ${t.name} sample` : `Play ${t.name} sample`}
                >
                  {playing === t.key ? <PauseIcon /> : <PlayIcon />}
                </button>
                <div className={s.typeId}>
                  <div className={s.typeName}>{t.name} <span className={s.typeSite}>· {t.site}</span></div>
                  <div className={s.typeSample}>sample audio · {t.loHz}–{t.hiHz} Hz</div>
                </div>
                {dominant.key === t.key && types[t.key] > 0 && (
                  <span className={s.yours}>{pct(types[t.key])}% of yours</span>
                )}
              </div>

              {/* Frequency band: where this type lives on the 0–3 kHz axis */}
              <div className={s.band} aria-hidden>
                <i
                  className={s.bandFill}
                  style={{
                    left: `${(t.loHz / BAND_MAX_HZ) * 100}%`,
                    width: `${((t.hiHz - t.loHz) / BAND_MAX_HZ) * 100}%`,
                  }}
                />
              </div>
              <div className={s.bandAxis} aria-hidden><span>0</span><span>1 kHz</span><span>2 kHz</span><span>3 kHz</span></div>

              <p className={s.typeDesc}>{t.character} <span className={s.em}>{t.device}</span></p>
            </div>
          ))}
        </div>

        {/* ---- Your fingerprint (real data) ---- */}
        <div className={s.finger}>
          <div className={s.top}>
            <div className={s.k}>Your acoustic fingerprint</div>
            <div className={s.ts}>{last ? `Last night` : 'No nights yet'}</div>
          </div>
          {last && (
            <div className={s.v}>
              <span className={s.pct}>{pct(types[dominant.key])}%</span>
              <span className={s.it}>{dominant.site.toLowerCase()}</span> · {dominant.key === 'palatal' ? 'low rumble, periodic' : dominant.key === 'tongue' ? 'broadband, irregular' : 'high flutter'}
            </div>
          )}

          <div className={s.breakdown}>
            <div className={s.b}><div className={s.nm}>Soft palate</div><div className={s.pc}>{pct(types.palatal)}%</div><div className={s.desc}>Periodic, low rumble</div></div>
            <div className={s.b}><div className={s.nm}>Tongue base</div><div className={s.pc}>{pct(types.tongue)}%</div><div className={s.desc}>Broadband, irregular</div></div>
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
            {types.palatal + types.tongue > types.nasal
              ? <>Most of your snoring comes from tissue the mouthpiece can reach. <span className={s.em}>That's why jaw advancement is the right tool for you.</span></>
              : <>A lot of your snoring is nasal — <span className={s.em}>worth pairing the mouthpiece with breathing strips.</span></>}
          </div>
        </div>

        {/* ---- The published evidence ---- */}
        <h2 className={s.h2}>The <span className={s.it}>published evidence</span></h2>
        <p className={s.h2sub}>The claims this screen makes, and where they come from. Peer-reviewed, not marketing.</p>

        <div className={s.find}>
          <div className={s.meta}>
            <div className={s.nm}>Sound reveals the <span className={s.it}>vibration site</span></div>
            <div className={s.conf}>p &lt; 0.0001</div>
          </div>
          <div className={s.insight}>
            Snore energy splits into low, mid and high bands, and the band pattern maps to where
            the obstruction is — palate and tongue-base each leave a distinct signature.
            <span className={s.cite}>Sci. Rep. srep30629 · Acta Otorhinolaryngol.</span>
          </div>
        </div>

        <div className={s.find}>
          <div className={s.meta}>
            <div className={s.nm}>Classification from <span className={s.it}>audio alone</span> works</div>
            <div className={s.conf}>92% accuracy</div>
          </div>
          <div className={s.insight}>
            In clinical recordings labeled by direct endoscopic observation, machine classifiers
            identified the snore's origin site from sound alone with 92.2% accuracy.
            <span className={s.cite}>PMC8320490 · VOTE classification</span>
          </div>
        </div>

        <div className={s.find}>
          <div className={s.meta}>
            <div className={s.nm}>Phone-mic counting is <span className={s.it}>validated</span></div>
            <div className={s.conf}>95% accuracy</div>
          </div>
          <div className={s.insight}>
            Smartphone snore detection has reached 95.2% accuracy against ground truth in formal
            trials — counting snores from a nightstand mic is publishable-grade measurement.
            <span className={s.cite}>JMIR Formative Research 2025 · IJERPH 18/7326</span>
          </div>
        </div>

        <div className={s.find}>
          <div className={s.meta}>
            <div className={s.nm}>Timing beats <span className={s.it}>counting</span></div>
            <div className={s.conf}>r = 0.89</div>
          </div>
          <div className={s.insight}>
            The rhythm of snoring — how it clusters and pauses — tracks clinical severity far better
            than raw counts (r = 0.89 vs 0.39). That's why the app measures snore-time percentage
            and quiet stretches, not just a number.
            <span className={s.cite}>Meta-analysis, PMC9670768 · 13 studies, 3,153 adults</span>
          </div>
        </div>

        {wine.confidence !== 'insufficient' && (
          <div className={s.find}>
            <div className={s.meta}>
              <div className={s.nm}>And in <span className={s.it}>your own data</span></div>
              <div className={`${s.conf} ${wine.confidence === 'emerging' ? s.med : ''}`}>
                {wine.confidence === 'solid' ? 'Solid' : 'Emerging'} · your nights
              </div>
            </div>
            <div className={s.insight}>
              {wine.sentence} <span className={s.em}>Alcohol relaxes the same muscles the strap is
              fighting</span> — the one variable the device can't reach.
            </div>
          </div>
        )}

        <p className={s.footnote}>
          Detection runs on your phone: loudness-gated, low-frequency-aware event detection with
          band-energy classification. Your audio never leaves the device. And the honest limit:
          a microphone measures snoring — it cannot detect or diagnose sleep apnea. If something
          in your data is worth a clinician's eyes, the app will say so, plainly.
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

function PlayIcon() {
  return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>;
}
function PauseIcon() {
  return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M4 2.5h3v11H4zm5 0h3v11H9z" fill="currentColor" /></svg>;
}
