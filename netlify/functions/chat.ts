// Streaming proxy for the Anthropic Messages API.
// Hides ANTHROPIC_API_KEY server-side so the deployed bundle ships no secrets.
//
// Netlify Functions v2: web-standard Request/Response, streaming via ReadableStream.
// `config.path` registers the URL; no netlify.toml redirect needed.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS_CAP = 600;

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Cap max_tokens so a scraped endpoint can't run up a bill.
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
    return json({ error: 'Upstream error', status: upstream.status, detail: detail.slice(0, 500) }, upstream.status);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
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
