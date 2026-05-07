// Tiny animation helpers — number tick, path draw-in, pull-to-refresh.

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Animate text content from 0 → target over `duration` ms. Handles "7:12" too. */
export function tickNumber(el: Element | null, target: string, duration = 600) {
  if (!el) return;
  const colon = target.includes(':');
  if (colon) {
    const [hh, mm] = target.split(':').map(Number);
    const total = hh * 60 + mm;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeOut(t);
      const cur = Math.round(total * e);
      const ch = Math.floor(cur / 60);
      const cm = cur % 60;
      el.textContent = `${ch}:${String(cm).padStart(2, '0')}`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return;
  }
  const m = target.match(/^(\d+)(\D*)$/);
  if (!m) { el.textContent = target; return; }
  const n = parseInt(m[1], 10);
  const suffix = m[2] || '';
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const e = easeOut(t);
    el.textContent = `${Math.round(n * e)}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Draw an SVG <path> by animating stroke-dashoffset from full length → 0. */
export function drawPath(path: SVGPathElement | SVGPolylineElement | null, duration = 800) {
  if (!path) return;
  const len = (path as SVGPathElement).getTotalLength?.() ?? 360;
  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = String(len);
  path.getBoundingClientRect();
  path.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  path.style.strokeDashoffset = '0';
}

/** Pull-to-refresh: returns a destroy fn. */
export function installPullToRefresh(host: HTMLElement, onTrigger: () => void): () => void {
  let startY = 0;
  let pulling = false;
  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  Object.assign(indicator.style, {
    position: 'absolute',
    left: '50%',
    top: '0',
    transform: 'translate(-50%, -28px) scale(0.6)',
    width: '24px', height: '24px',
    borderRadius: '50%',
    border: '2px solid rgba(134,200,184,0.5)',
    borderTopColor: 'transparent',
    transition: 'transform 200ms, opacity 200ms',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '5',
  });
  host.style.position = host.style.position || 'relative';
  host.appendChild(indicator);

  const onStart = (e: TouchEvent | PointerEvent) => {
    if (host.scrollTop > 4) return;
    startY = ('touches' in e ? e.touches[0].clientY : e.clientY);
    pulling = true;
  };
  const onMove = (e: TouchEvent | PointerEvent) => {
    if (!pulling) return;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY);
    const delta = Math.max(0, Math.min(80, y - startY));
    if (delta > 6) {
      indicator.style.opacity = String(Math.min(1, delta / 60));
      indicator.style.transform = `translate(-50%, ${delta - 28}px) scale(${0.6 + delta / 200}) rotate(${delta * 6}deg)`;
    }
    if (delta >= 60) {
      pulling = false;
      indicator.style.transform = `translate(-50%, 32px) scale(1) rotate(0deg)`;
      indicator.style.animation = 'spin 0.8s linear infinite';
      onTrigger();
      setTimeout(() => {
        indicator.style.opacity = '0';
        indicator.style.animation = '';
      }, 600);
    }
  };
  const onEnd = () => {
    if (pulling) {
      indicator.style.opacity = '0';
      indicator.style.transform = 'translate(-50%, -28px) scale(0.6)';
    }
    pulling = false;
  };

  host.addEventListener('touchstart', onStart, { passive: true });
  host.addEventListener('touchmove', onMove, { passive: true });
  host.addEventListener('touchend', onEnd);
  host.addEventListener('pointerdown', onStart);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onEnd);
  host.addEventListener('pointercancel', onEnd);

  return () => {
    indicator.remove();
    host.removeEventListener('touchstart', onStart);
    host.removeEventListener('touchmove', onMove);
    host.removeEventListener('touchend', onEnd);
    host.removeEventListener('pointerdown', onStart);
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerup', onEnd);
    host.removeEventListener('pointercancel', onEnd);
  };
}
