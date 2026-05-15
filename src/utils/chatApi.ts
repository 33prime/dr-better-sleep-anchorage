// Real Claude API integration for Dr. Sommers chat.
//
// Production: calls /api/chat (a Netlify Function that proxies the Anthropic
// Messages API server-side). The ANTHROPIC_API_KEY lives in Netlify env vars —
// no secret in the bundle.
//
// Dev: if VITE_ANTHROPIC_API_KEY is set, calls Anthropic directly so you can
// run plain `vite dev` without `netlify dev`. Otherwise it tries the proxy
// (works under `netlify dev`).

import type { AppState, ChatMessage } from '../seed';
import { partnerSleptThroughLastN, streakNights, wineMultiplier } from '../store';

const MODEL = 'claude-opus-4-7';
const PROXY_URL = '/api/chat';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEV_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
const USE_DEV_DIRECT = import.meta.env.DEV && !!DEV_API_KEY;

const SYSTEM_PERSONA = `You are Dr. Sommers — the AI sleep coach inside the Dr. Never Snore app.

Voice: quiet, observational, slightly literary. Like a thoughtful older clinician who has seen everything and does not lecture. Direct, never preachy. You notice things in the data and say what you see.

You are aware that snoring is a relationship problem as much as a health problem. The user, Matt, shares a bed with his partner Sarah. When the moment calls for it, acknowledge her by name — her sleep matters here too.

Rules:
- Keep replies short. One to three sentences. Four at most.
- Reference data when it earns the mention; do not recite numbers without reason.
- Use lowercase for the casual moments. Use *asterisks* for emphasis, sparingly.
- You are a coach, not a doctor. Never diagnose. Never recommend medications or dosages.
- If the user asks about apnea, prescriptions, surgery, or anything clinical, gently route them to a sleep clinician — "worth bringing to someone with letters after their name."
- No bullet lists. No headings. Conversation, not a chart.
- Never break character or mention the words "AI", "language model", "Anthropic", or "Claude".`;

function buildDataContext(state: AppState): string {
  const last7 = state.nights.slice(-7).map(n => ({
    date: n.date,
    snores: n.totalSnores,
    alcohol: n.alcohol,
    sleep_min: n.sleepDurationMin,
    deep_min: n.deepMin,
    efficiency: Math.round(n.efficiency * 100) / 100,
    partner_slept_through: n.partnerSleptThrough,
    strap_position: n.strapPosition,
  }));

  const wine = wineMultiplier(state);
  const partner = partnerSleptThroughLastN(state, 7);
  const streak = streakNights(state);

  return `Context — Matt's recent data:

Last 7 nights:
${JSON.stringify(last7, null, 2)}

Patterns:
- Wine-night snore multiplier (post-device): ${wine !== null ? `${wine.toFixed(2)}× more snores on alcohol nights vs sober nights` : 'not enough data'}
- Sarah slept through ${partner.slept} of ${partner.total} nights this week
- ${streak} nights since the device was fitted; current strap position ${state.device.strapPosition} of 5
- Device fitted on ${state.device.fittedAt}`;
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
    // The persona never changes; the data changes once per night.
    system: [
      { type: 'text', text: SYSTEM_PERSONA, cache_control: { type: 'ephemeral' } },
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
