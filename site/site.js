// Dr. Better Sleep site — waitlist capture + scroll reveals.
// The form writes to the Supabase `waitlist` table (insert-only for anon;
// see supabase/migrations/0002_waitlist.sql). The anon key is public by
// design — RLS is the boundary.

const SUPABASE_URL = 'https://fjesukwxlntmgriojnpn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_90gYbYTBsOQvYn9uHgT8MA_7ig5YL28';

async function joinWaitlist(email) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ email, source: 'site' }),
  });
  if (res.status === 409) return 'duplicate';
  if (!res.ok) throw new Error(`waitlist insert failed: ${res.status}`);
  return 'ok';
}

for (const form of document.querySelectorAll('.capture')) {
  const note = form.querySelector('[data-note]');
  const original = note.textContent;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.querySelector('.hp').value) return; // honeypot
    const email = form.querySelector('input[type="email"]').value.trim();
    const button = form.querySelector('button');
    button.disabled = true;
    note.classList.remove('ok', 'err');
    try {
      const result = await joinWaitlist(email);
      note.textContent = result === 'duplicate'
        ? "You're already on the list — see you this fall."
        : "You're on the list. One email when preorders open.";
      note.classList.add('ok');
      form.querySelector('input[type="email"]').value = '';
    } catch {
      note.textContent = "That didn't go through — try once more?";
      note.classList.add('err');
      button.disabled = false;
      return;
    }
    setTimeout(() => { note.textContent = original; note.classList.remove('ok'); button.disabled = false; }, 6000);
  });
}

// Scroll reveals (no-op when reduced motion is preferred — CSS shows content).
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) { entry.target.classList.add('in'); observer.unobserve(entry.target); }
  }
}, { threshold: 0.2 });
for (const el of document.querySelectorAll('.reveal')) observer.observe(el);
