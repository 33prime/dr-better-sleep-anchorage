import { useState } from 'react';
import { useLocation } from 'wouter';
import { useStore, store, daysSince } from '../store';
import { writePartner, writeUiTheme } from '../lib/sync';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Avatar } from '../components/Avatar';
import { Wordmark } from '../components/Wordmark';
import { ChevronRight } from '../components/icons';
import { showToast } from '../components/Toast';
import s from './Profile.module.css';

const THEMES: Array<'auto' | 'light' | 'dark'> = ['auto', 'light', 'dark'];

export function Profile() {
  const state = useStore();
  const [, navigate] = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  const used = daysSince(state.device.fittedAt);
  const pctLife = Math.min(100, Math.round((used / state.device.lifespanNights) * 100));

  const setTheme = (t: 'auto' | 'light' | 'dark') => writeUiTheme(t);
  const toggleNotify = () => writePartner({ notifyAtMorning: !state.partner.notifyAtMorning });

  const isAccount = state.mode === 'account' && !!state.auth;

  // `unhydrate()` (via main.tsx's onAuthStateChange -> SIGNED_OUT listener)
  // drops the store back to local-demo mode once Supabase confirms sign-out
  // — no need to touch the store here directly.
  const handleSignOut = async () => {
    if (!supabase) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      showToast('Signed out — back to the local demo.');
    } catch {
      showToast("Couldn't sign out — try again.");
    } finally {
      setSigningOut(false);
    }
  };

  // Only meaningful in local-demo mode: an account's nights live in Supabase
  // and resetting the local seed shouldn't touch them.
  const handleResetDemo = () => {
    store.reset();
    showToast('Reset to the demo seed.');
    navigate('/');
  };

  return (
    <div className={s.root}>
      <div className={s.header}>
        <Avatar size={88} withDot />
        <div className={s.id}>
          <div className={s.name}>{state.user.name}</div>
          <div className={s.meta}>{state.user.ageRange} · {state.user.sex} · BMI {state.user.bmiRange}</div>
        </div>
      </div>

      {/* Account */}
      <div className={s.sectionLabel}>Account</div>
      <div className={s.card}>
        {isAccount ? (
          <div className={s.toggleRow}>
            <div className={s.toggleText}>
              <div className={s.rowTitle}>Signed in</div>
              <div className={s.rowSub}>{state.auth!.email}</div>
            </div>
          </div>
        ) : (
          <div className={s.toggleRow}>
            <div className={s.toggleText}>
              <div className={s.rowTitle}>Browsing the local demo</div>
              <div className={s.rowSub}>Sign in to save your nights to your account.</div>
            </div>
          </div>
        )}
      </div>
      {isAccount ? (
        <button className={`${s.signout} tap`} onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      ) : (
        <button className={`${s.rowLink} tap`} onClick={() => navigate('/auth')}>
          <span>Sign in</span><ChevronRight />
        </button>
      )}

      {/* Device */}
      <div className={s.sectionLabel}>Your device</div>
      <button className={`${s.card} ${s.deviceCard} tap`} onClick={() => navigate('/onboarding/device')}>
        <div className={s.deviceTop}>
          <Wordmark size={22} tone="auto" />
          <ChevronRight />
        </div>
        <div className={s.deviceStats}>
          <div><div className={s.k}>Strap</div><div className={s.v}>{state.device.strapPosition}<span className={s.of}> / 5</span></div></div>
          <div><div className={s.k}>In use</div><div className={s.v}>{used}<span className={s.of}> nights</span></div></div>
          <div><div className={s.k}>Life used</div><div className={s.v}>{pctLife}<span className={s.of}>%</span></div></div>
        </div>
        {/* teal = life used; the coral cap marks the wear of the current strap */}
        <div className={s.meter}>
          <i className={s.meterTeal} style={{ width: `${pctLife}%` }} />
          <i className={s.meterCoral} style={{ left: `${pctLife}%`, width: '9%' }} />
        </div>
      </button>
      <button className={`${s.rowLink} tap`} onClick={() => navigate('/reorder')}>
        <span>Reorder or replace device</span><ChevronRight />
      </button>

      {/* Sleep partner */}
      <div className={s.sectionLabel}>Sleep partner</div>
      <div className={s.card}>
        <div className={s.toggleRow}>
          <div className={s.toggleText}>
            <div className={s.rowTitle}>Notify {state.partner.name} each morning</div>
            <div className={s.rowSub}>A short recap of how the night went.</div>
          </div>
          <button
            className={`${s.switch} ${state.partner.notifyAtMorning ? s.on : ''}`}
            onClick={toggleNotify}
            aria-pressed={state.partner.notifyAtMorning}
            aria-label={`Toggle morning recap for ${state.partner.name}`}
          >
            <span className={s.knob} />
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className={s.sectionLabel}>Appearance</div>
      <div className={s.card}>
        <div className={s.seg} role="group" aria-label="Theme">
          {THEMES.map(t => (
            <button
              key={t}
              className={`${s.segBtn} ${state.uiTheme === t ? s.segOn : ''} tap`}
              onClick={() => setTheme(t)}
              aria-pressed={state.uiTheme === t}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className={s.rowSub} style={{ marginTop: 12 }}>Auto switches to a dark dashboard after 6 pm.</div>
      </div>

      {/* More */}
      <div className={s.sectionLabel}>More</div>
      <div className={s.card}>
        <button className={`${s.listRow} tap`} onClick={() => navigate('/trends/science')}>
          <span>The science behind your data</span><ChevronRight />
        </button>
        <button className={`${s.listRow} tap`} onClick={() => navigate('/onboarding/setup')}>
          <span>Re-fit the device</span><ChevronRight />
        </button>
        <button className={`${s.listRow} tap`} onClick={() => navigate('/onboarding')}>
          <span>Replay onboarding</span><ChevronRight />
        </button>
        {!isAccount && (
          <button className={`${s.listRow} tap`} onClick={handleResetDemo}>
            <span>Reset demo data</span><ChevronRight />
          </button>
        )}
      </div>

      {!isSupabaseConfigured && (
        <div className={s.rowSub} style={{ marginTop: 10, textAlign: 'center' }}>
          Sign-in isn't configured for this build — the demo still works locally.
        </div>
      )}

      <div className={s.scrollPad} />
    </div>
  );
}
