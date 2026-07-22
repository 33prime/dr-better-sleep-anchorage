// Create an invite-only account. The app never self-serves signups
// (Auth.tsx uses shouldCreateUser: false) — this script is how accounts
// are born. The person then signs in normally with the email OTP code.
//
// Usage:
//   node scripts/create-account.mjs friend@example.com
//   node scripts/create-account.mjs friend@example.com --name "Jordan" --partner "Casey"

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

const args = process.argv.slice(2);
const email = args.find(a => !a.startsWith('--'));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/create-account.mjs <email> [--name "Name"] [--partner "Partner"]');
  process.exit(1);
}
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Idempotent: reuse the existing user if the email is already registered.
let userId;
const { data: created, error } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
});
if (error) {
  if (/already|registered|exists/i.test(error.message)) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) { console.error('Lookup failed:', listErr.message); process.exit(1); }
    const existing = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) { console.error('User reported as existing but not found.'); process.exit(1); }
    userId = existing.id;
    console.log(`Account already existed — updating profile only.`);
  } else {
    console.error('Create failed:', error.message);
    process.exit(1);
  }
} else {
  userId = created.user.id;
  console.log(`Account created: ${email}`);
}

// The auth trigger creates an empty profile row; layer any provided names on it.
const name = flag('name');
const partner = flag('partner');
if (name || partner) {
  const patch = { updated_at: new Date().toISOString() };
  if (name) patch.name = name;
  if (partner) patch.partner_name = partner;
  const { error: pErr } = await admin.from('profiles').update(patch).eq('id', userId);
  if (pErr) { console.error('Profile update failed:', pErr.message); process.exit(1); }
  console.log(`Profile set${name ? ` — name: ${name}` : ''}${partner ? `, partner: ${partner}` : ''}`);
}

console.log(`\nDone. They sign in at https://dr-never-snore.netlify.app with ${email} (6-digit email code).`);
