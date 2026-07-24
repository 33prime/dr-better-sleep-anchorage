// Streaming proxy for the Anthropic Messages API — Netlify Edge Function.
//
// Runs at the edge on Deno runtime. Unlike regular Functions, Edge Functions
// stream response bodies through to the client without CDN buffering — the SSE
// chunks from Anthropic arrive at the browser token-by-token.
//
// SECURITY: this endpoint spends the site's paid ANTHROPIC_API_KEY on every
// call, so it must never be reachable by an anonymous caller — the client's
// `model`/`system`/`messages` are otherwise forwarded near-verbatim to
// Anthropic, which is both a prompt-injection surface and an unmetered
// billing surface. We require a valid Supabase session (checked against
// Supabase's own Auth server, not just decoded) before proxying anything,
// allow-list the model, cap total input size, and apply a best-effort
// per-user rate limit on top of the existing per-request max_tokens cap.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS_CAP = 800;
const ALLOWED_MODELS = new Set(['claude-sonnet-5']);
const DEFAULT_MODEL = 'claude-sonnet-5';
// Generous but bounded — a normal turn (persona + data context + a few
// messages) is a few thousand chars; this stops someone from paying for our
// key to summarize a novel.
const MAX_INPUT_CHARS = 40_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

// Deno is the Edge Functions runtime; declare the globals for our TS view.
declare const Deno: { env: { get(key: string): string | undefined } };

// Best-effort, in-memory per-isolate rate limiter. Edge Functions can run on
// many isolates behind a single deployment, so this does not enforce a truly
// global limit — it's a cheap first line of defense against a single warm
// instance being hammered, layered on top of the auth requirement (which is
// the real fix: abuse now requires a real, rate-limitable Supabase account,
// not an anonymous request). A durable global limiter (Netlify Blobs/Upstash,
// keyed by user id) would be a stronger follow-up if abuse is observed.
const requestLog = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(userId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(userId, timestamps);
  // Cheap cap on unbounded growth if this isolate stays warm a long time.
  if (requestLog.size > 5000) requestLog.clear();
  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

async function verifyUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return null;

  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return typeof user?.id === 'string' ? user.id : null;
  } catch {
    return null;
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500);
  }

  // Require a real, currently-valid Supabase session — this is what stops
  // the endpoint from being a free/anonymous pass-through to the paid key.
  const userId = await verifyUser(req.headers.get('authorization'));
  if (!userId) {
    return json({ error: 'Unauthorized — sign in required' }, 401);
  }
  if (isRateLimited(userId)) {
    return json({ error: 'Rate limit exceeded — slow down' }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Bound total input size before forwarding — output tokens were already
  // capped, but nothing previously stopped an oversized `messages`/`system`.
  const inputSize = JSON.stringify(body.system ?? '').length + JSON.stringify(body.messages ?? '').length;
  if (inputSize > MAX_INPUT_CHARS) {
    return json({ error: 'Request too large' }, 413);
  }

  // Never trust the client's `model` — allow-list it so this can't be
  // repurposed as a general-purpose proxy to arbitrary Anthropic models.
  body.model = typeof body.model === 'string' && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;

  // Cap max_tokens to bound exposure if the endpoint is abused.
  const requested = typeof body.max_tokens === 'number' ? body.max_tokens : 400;
  body.max_tokens = Math.min(requested, MAX_TOKENS_CAP);
  body.stream = true;

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return json(
      { error: 'Upstream error', status: upstream.status, detail: detail.slice(0, 500) },
      upstream.status,
    );
  }

  // Pass the upstream SSE stream straight through. no-transform tells any
  // intermediary not to coalesce chunks.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const config = {
  path: '/api/chat',
};
