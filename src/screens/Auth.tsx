import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Wordmark } from '../components/Wordmark';
import { ArrowRight } from '../components/icons';
import { PaperStar, PaperMoon } from '../components/paper/PaperScene';
import s from './Auth.module.css';

// Demo access goes through /api/demo-login (server holds the credential —
// nothing demo-related ships in this bundle). The button shows whenever
// Supabase is configured; if the endpoint isn't deployed (e.g. plain vite
// preview), the tap fails soft with an error line.
const DEMO_LOGIN_URL = '/api/demo-login';
const DEMO_AVAILABLE = true; // endpoint-gated at tap time, not build time

const CODE_LEN = 6;
const RESEND_COOLDOWN_S = 30;

function isLikelyEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/**
 * Email -> 6-digit OTP sign-in (per PLAN.md "Client architecture"). Not a
 * hard gate — reachable from a "Sign in" affordance on Profile / first run.
 * Falls back to a friendly notice if Supabase isn't configured for this build.
 */
export function Auth() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') boxRefs.current[0]?.focus();
  }, [step]);

  async function sendCode(resend = false) {
    if (!supabase) { setError("Sign-in isn't available in this build."); return; }
    if (!isLikelyEmail(email)) { setError('That email doesn’t look right — mind checking it?'); return; }
    setError(null);
    setLoading(true);
    try {
      // Invite-only: accounts are created by the team (scripts/create-account.mjs),
      // never self-serve — an unknown email gets a friendly nudge, not an account.
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });
      if (err) {
        const msg = err.message?.toLowerCase() ?? '';
        if (msg.includes('signup') || msg.includes('not allowed') || msg.includes('not found')) {
          throw new Error("That email isn't on the list yet — Dr. Never Snore is invite-only for now.");
        }
        throw err;
      }
      setStep('code');
      setCooldown(RESEND_COOLDOWN_S);
      if (resend) { setDigits(Array(CODE_LEN).fill('')); boxRefs.current[0]?.focus(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a code. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(code: string) {
    if (!supabase) { setError("Sign-in isn't available in this build."); return; }
    if (code.length !== CODE_LEN) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: 'email',
      });
      if (err) throw err;
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code didn’t match — check it and try again.');
      setDigits(Array(CODE_LEN).fill(''));
      boxRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function exploreDemo() {
    if (!supabase) return;
    setError(null);
    setDemoLoading(true);
    try {
      const res = await fetch(DEMO_LOGIN_URL, { method: 'POST' });
      if (!res.ok) throw new Error('Could not load the demo account right now.');
      const { access_token, refresh_token } = await res.json();
      if (!access_token || !refresh_token) throw new Error('Could not load the demo account right now.');
      const { error: err } = await supabase.auth.setSession({ access_token, refresh_token });
      if (err) throw err;
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the demo account right now.');
    } finally {
      setDemoLoading(false);
    }
  }

  function setDigitAt(i: number, v: string) {
    const clean = v.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < CODE_LEN - 1) boxRefs.current[i + 1]?.focus();
    const joined = next.join('');
    if (joined.length === CODE_LEN) verifyCode(joined);
  }

  function onBoxKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      boxRefs.current[i - 1]?.focus();
    }
  }

  function onBoxPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LEN);
    if (!text) return;
    e.preventDefault();
    const next = Array(CODE_LEN).fill('');
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    const lastFilled = Math.min(text.length, CODE_LEN) - 1;
    boxRefs.current[Math.max(0, lastFilled)]?.focus();
    if (text.length === CODE_LEN) verifyCode(text);
  }

  const canSend = isLikelyEmail(email) && !loading;

  return (
    <div className={s.root}>
      {/* night-only papercraft cluster tucked behind the header */}
      <svg viewBox="0 0 340 100" className={s.scene} aria-hidden focusable="false">
        <PaperStar x={30} y={26} scale={0.9} delay={0.5} />
        <PaperStar x={78} y={54} scale={0.6} delay={2.2} />
        <PaperStar x={296} y={58} scale={0.7} delay={1.3} />
        <PaperMoon x={286} y={16} scale={1.7} />
      </svg>

      <div className={s.brandRow}>
        <Wordmark size={19} tone="auto" />
      </div>

      {step === 'email' ? (
        <>
          <h1 className={s.h}>
            One quiet step,<br />
            <span className={s.it}>and you're saved.</span>
          </h1>
          <p className={s.bodyCopy}>
            Enter the email your invite was set up with and I'll send a 6-digit
            code — no password to remember. Every night you track lives under
            this address from here on.
          </p>

          <form
            className={s.form}
            onSubmit={(e) => { e.preventDefault(); sendCode(); }}
          >
            <label className={s.label} htmlFor="auth-email">Email</label>
            <div className={s.field}>
              <input
                id="auth-email"
                className={s.fieldInput}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                autoFocus
              />
            </div>

            {error && <div className={s.error}>{error}</div>}

            <button type="submit" className={`${s.btn} ${s.btnPrimary} tap`} disabled={!canSend}>
              <span>{loading ? 'Sending code…' : 'Send code'} <ArrowRight /></span>
            </button>
          </form>

          {!isSupabaseConfigured && (
            <div className={s.notice}>Sign-in isn't configured for this build — the demo still works locally.</div>
          )}

          {DEMO_AVAILABLE && (
            <>
              <div className={s.divider}><span>or</span></div>
              <button className={`${s.btn} ${s.btnGhost} tap`} onClick={exploreDemo} disabled={demoLoading}>
                {demoLoading ? 'Loading demo…' : 'Explore the demo'}
              </button>
            </>
          )}

          <button className={`${s.skip} tap`} onClick={() => navigate('/')}>
            Not now — keep browsing
          </button>
        </>
      ) : (
        <>
          <h1 className={s.h}>
            Check your email.<br />
            <span className={s.it}>Enter the code.</span>
          </h1>
          <p className={s.bodyCopy}>
            Six digits, sent to <span className={s.em}>{email}</span>. It expires in a few minutes.
          </p>

          <div className={s.codeRow} onPaste={onBoxPaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { boxRefs.current[i] = el; }}
                className={s.codeBox}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={d}
                onChange={(e) => setDigitAt(i, e.target.value)}
                onKeyDown={(e) => onBoxKeyDown(i, e)}
                disabled={loading}
                aria-label={`Digit ${i + 1} of ${CODE_LEN}`}
              />
            ))}
          </div>

          {error && <div className={s.error}>{error}</div>}

          <button
            className={`${s.btn} ${s.btnPrimary} tap`}
            disabled={loading || digits.join('').length !== CODE_LEN}
            onClick={() => verifyCode(digits.join(''))}
          >
            <span>{loading ? 'Verifying…' : 'Verify & continue'} <ArrowRight /></span>
          </button>

          <div className={s.linkRow}>
            <button
              className={`${s.linkBtn} tap`}
              onClick={() => sendCode(true)}
              disabled={cooldown > 0 || loading}
            >
              {cooldown > 0 ? `Resend in 0:${String(cooldown).padStart(2, '0')}` : 'Resend code'}
            </button>
            <button
              className={`${s.linkBtn} tap`}
              onClick={() => { setStep('email'); setDigits(Array(CODE_LEN).fill('')); setError(null); }}
            >
              Use a different email
            </button>
          </div>
        </>
      )}

      <div style={{ height: 16 }} />
    </div>
  );
}
