// Streaming proxy for the Anthropic Messages API — Netlify Edge Function.
//
// Runs at the edge on Deno runtime. Unlike regular Functions, Edge Functions
// stream response bodies through to the client without CDN buffering — the SSE
// chunks from Anthropic arrive at the browser token-by-token.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS_CAP = 800;

// Deno is the Edge Functions runtime; declare the global for our TS view.
declare const Deno: { env: { get(key: string): string | undefined } };

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

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
