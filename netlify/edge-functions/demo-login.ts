// Demo-account login — Netlify Edge Function.
//
// "Explore the demo" must NOT ship the demo account's password inside the
// public JS bundle (a live credential in a shipped artifact). Instead the
// client hits this endpoint; the password lives only in Netlify env vars,
// the server performs the password grant against Supabase Auth, and the
// client receives a normal (short-lived, refreshable) session to install
// via supabase.auth.setSession().
//
// The demo account itself is intentionally public — this endpoint hands a
// session to anyone who asks. What it protects is the *credential* (which
// can be rotated centrally without shipping a new build) and gives us one
// chokepoint to rate-limit or disable demo access entirely.

declare const Deno: { env: { get(key: string): string | undefined } };

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10; // per IP — a human taps this once
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE_LIMIT_MAX;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const email = Deno.env.get('DEMO_EMAIL');
  const password = Deno.env.get('DEMO_PASSWORD');
  if (!supabaseUrl || !anonKey || !email || !password) {
    return json({ error: 'Demo login is not configured' }, 501);
  }

  const ip = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown';
  if (limited(ip)) return json({ error: 'Slow down' }, 429);

  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    return json({ error: 'Demo account unavailable' }, 502);
  }
  const session = await res.json();
  // Forward only what setSession needs — not the full grant payload.
  return json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }, 200);
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const config = {
  path: '/api/demo-login',
};
