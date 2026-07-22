// Real Claude API integration for Dr. Sommers chat.
//
// Production: calls /api/chat (a Netlify Function that proxies the Anthropic
// Messages API server-side). The ANTHROPIC_API_KEY lives in Netlify env vars —
// no secret in the bundle.
//
// Dev: if VITE_ANTHROPIC_API_KEY is set, calls Anthropic directly so you can
// run plain `vite dev` without `netlify dev`. Otherwise it tries the proxy
// (works under `netlify dev`).
//
// Persona + data context are built from live state (src/seed.ts `AppState`)
// — never hardcoded names — and lean on src/utils/insights.ts (owned by the
// insights lane) for graded, honest claims about trends rather than reciting
// raw numbers. Wearable-ingest fields (efficiency, HRV, resting HR, sleep
// stages, position) are called out explicitly as unavailable when a night
// has no wearable connected, per PLAN.md finding #1 — the model is told not
// to reference them rather than being handed a fabricated zero.

import type { AppState, ChatMessage, Night } from '../seed';
import { partnerSleptThroughLastN, streakNights } from '../store';
import {
  snoreTimeTrend, wineEffect, typeMixShift, quietProgress, deviceEffect, bestNight, weekSummary,
} from './insights';
import { insertChatMessage as dbInsertChatMessage } from '../lib/db';
import { supabase } from '../lib/supabase';

// The proxy (netlify/edge-functions/chat.ts) requires a valid Supabase
// session — it spends the site's paid Anthropic key, so it must never be an
// anonymous pass-through. Local-demo (logged-out) visitors get this canned,
// in-character line instead of a network call that would otherwise fail
// (401) or, before this fix existed, succeed for anyone.
const SIGN_IN_NUDGE =
  "sign in and I can look at your actual nights — for now, feel free to poke around, I'll be here when you're ready.";

const MODEL = 'claude-opus-4-7';
const PROXY_URL = '/api/chat';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEV_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
const USE_DEV_DIRECT = import.meta.env.DEV && !!DEV_API_KEY;

function buildSystemPersona(state: AppState): string {
  const partnerName = state.partner.name || 'their partner';
  return `You are Dr. Sommers — the AI sleep coach inside the Dr. Never Snore app.

Voice: quiet, observational, slightly literary. Like a thoughtful older clinician who has seen everything and does not lecture. Direct, never preachy. You notice things in the data and say what you see.

You are aware that snoring is a relationship problem as much as a health problem. The user shares a bed with ${partnerName}. When the moment calls for it, acknowledge ${partnerName} by name — their sleep matters here too.

Rules:
- Keep replies short. One to three sentences. Four at most.
- Reference data when it earns the mention; do not recite numbers without reason.
- Some insights below are marked "insufficient" confidence — don't lean on those as if they were solid findings; say there's not enough data yet if asked.
- Some fields are marked "not tracked — no wearable connected." Never invent a number for those; say honestly that it needs a wearable.
- Use lowercase for the casual moments. Use *asterisks* for emphasis, sparingly.
- You are a coach, not a doctor. Never diagnose. Never recommend medications or dosages.
- If the user asks about apnea, prescriptions, surgery, or anything clinical, gently route them to a sleep clinician — "worth bringing to someone with letters after their name."
- No bullet lists. No headings. Conversation, not a chart.
- Never break character or mention the words "AI", "language model", "Anthropic", or "Claude".`;
}

function fmtWearable(v: number | undefined, round = (x: number) => x): string {
  return typeof v === 'number' ? String(round(v)) : 'not tracked — no wearable connected';
}

function buildDataContext(state: AppState): string {
  const userName = state.user.name || 'the user';
  const partnerName = state.partner.name || 'their partner';
  const nights = state.nights;

  const last7 = nights.slice(-7).map((n: Night) => ({
    date: n.date,
    snores: n.totalSnores,
    alcohol: n.alcohol,
    sleep_min: n.sleepDurationMin,
    deep_min: fmtWearable(n.deepMin),
    efficiency: fmtWearable(n.efficiency, x => Math.round(x * 100) / 100),
    partner_slept_through: n.partnerSleptThrough,
    strap_position: n.strapPosition || 'unknown',
  }));

  // Graded insights (src/utils/insights.ts) — honest, confidence-labeled
  // claims rather than raw deltas the model might overstate.
  const trend = snoreTimeTrend(nights);
  const postFitNights = nights.filter(n => n.date >= state.device.fittedAt);
  const wine = wineEffect(postFitNights.length >= 4 ? postFitNights : nights);
  const typeMix = typeMixShift(nights);
  const quiet = quietProgress(nights);
  const device = deviceEffect(nights, state.device.fittedAt);
  const best = bestNight(nights);
  const week = weekSummary(nights);

  const partner = partnerSleptThroughLastN(state, 7);
  const streak = streakNights(state);
  const wearableConnected = nights.some(n => typeof n.efficiency === 'number');

  return `Context — ${userName}'s recent data (shares a bed with ${partnerName}):

Last 7 nights:
${JSON.stringify(last7, null, 2)}

Graded insights (confidence in brackets — "insufficient" means don't lean on it yet):
- Snore-time trend: ${trend.sentence} [${trend.confidence}]
- Alcohol effect: ${wine.sentence} [${wine.confidence}]
- Snore-type mix shift: ${typeMix.sentence} [${typeMix.confidence}]
- Quiet-stretch progress: ${quiet.sentence} [${quiet.confidence}]
- Device effect since fitting: ${device.sentence} [${device.confidence}]
- Best night: ${best.sentence} [${best.confidence}]
- This week: ${week.sentence} [${week.confidence}]

Other:
- ${partnerName} slept through ${partner.slept} of ${partner.total} nights this week
- ${streak} nights since the device was fitted; current strap position ${state.device.strapPosition} of 5
- Device fitted on ${state.device.fittedAt}
- Wearable status: ${wearableConnected
    ? 'connected — HR/HRV/sleep-stage/position fields are real for recent nights, subject to per-night gaps noted above'
    : 'not connected — HR, HRV, sleep stages, and body position are unavailable; only mic-measured snore data exists. Do not reference these fields as if they were tracked.'}`;
}

/**
 * Best-effort persistence of one finished chat turn to Supabase, only when
 * signed in (`state.mode === 'account'`). Deliberately bypasses sync.ts's
 * write-through queue: that queue is built for coalescing repeated writes to
 * a stable natural key (a night, a profile), while a streamed reply updates
 * its bubble many times a second — routing every token through the queue
 * would spam it. Chat is append-only and low-stakes to lose one turn of
 * (the next hydrate() pulls the true server history), so a single fire-and-
 * forget insert once the turn is final is the right trade.
 */
export async function persistChatTurn(state: AppState, who: 'me' | 'them', text: string): Promise<void> {
  if (state.mode !== 'account' || !state.auth?.userId || !text.trim()) return;
  try {
    await dbInsertChatMessage(state.auth.userId, { who, text });
  } catch (err) {
    console.error('Chat persist failed (will still show locally):', err);
  }
}

/**
 * Stream a Dr. Sommers reply. Yields text chunks as they arrive.
 * Falls back to a demo-mode message if VITE_ANTHROPIC_API_KEY is not set.
 */
export async function* streamChatReply(
  userText: string,
  history: ChatMessage[],
  state: AppState,
): AsyncGenerator<string, void, unknown> {
  // Gate the real API call on an authenticated session (account mode). The
  // dev-direct path (VITE_ANTHROPIC_API_KEY set) is a local-only escape
  // hatch and doesn't touch the shared proxy/key, so it's exempt.
  let accessToken: string | undefined;
  if (!USE_DEV_DIRECT) {
    if (state.mode !== 'account' || !state.auth?.userId || !supabase) {
      yield SIGN_IN_NUDGE;
      return;
    }
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token;
    if (!accessToken) {
      yield SIGN_IN_NUDGE;
      return;
    }
  }

  // Build the conversation. The last item in history is the user message we're replying to.
  const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of history) {
    if (!m.text) continue;
    apiMessages.push({
      role: m.who === 'me' ? 'user' : 'assistant',
      content: m.text,
    });
  }
  // Ensure the most recent user message is the last entry.
  if (apiMessages.length === 0 || apiMessages[apiMessages.length - 1].role !== 'user') {
    apiMessages.push({ role: 'user', content: userText });
  }

  const body = {
    model: MODEL,
    max_tokens: 400,
    // Split system into two blocks so we can cache the persona + data context.
    // The persona rarely changes (only if the user renames their partner);
    // the data changes once per night.
    system: [
      { type: 'text', text: buildSystemPersona(state), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: buildDataContext(state), cache_control: { type: 'ephemeral' } },
    ],
    messages: apiMessages,
    stream: true,
  };

  // Pick endpoint + headers based on environment.
  const url = USE_DEV_DIRECT ? ANTHROPIC_URL : PROXY_URL;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (USE_DEV_DIRECT) {
    headers['x-api-key'] = DEV_API_KEY!;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    headers['authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    console.error('Claude API error:', res.status, errText);
    yield "something's off on my end — give me a minute.";
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by blank lines.
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          yield evt.delta.text as string;
        }
      } catch {
        // Heartbeats and other non-JSON SSE lines — ignore.
      }
    }
  }
}
