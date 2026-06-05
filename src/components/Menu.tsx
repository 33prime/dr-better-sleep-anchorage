import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DotsIcon } from './icons';

export interface MenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

interface Props {
  items: MenuItem[];
  /** Trigger glyph. Defaults to the kebab/dots icon. */
  icon?: ReactNode;
  ariaLabel?: string;
  /** Class applied to the trigger button so it matches each screen's header. */
  className?: string;
}

/**
 * Accessible header action menu. The trigger toggles a small popover anchored
 * to its top-right; it closes on outside-click or Escape. Used to give the
 * previously-inert "⋯" header buttons real, sensible actions.
 */
export function Menu({ items, icon, ariaLabel = 'More', className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className={className ? `${className} tap` : 'tap'}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {icon ?? <DotsIcon />}
      </button>
      {open && (
        <div role="menu" className="header-menu">
          {items.map((it, i) => (
            <button
              key={i}
              role="menuitem"
              className="header-menu-item tap"
              onClick={() => { setOpen(false); it.onClick(); }}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
