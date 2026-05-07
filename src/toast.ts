// Tiny toast helper.

let timer: number | null = null;

export function showToast(text: string, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), ms);
}
