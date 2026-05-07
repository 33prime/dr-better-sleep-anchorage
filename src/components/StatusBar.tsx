import { useEffect, useState } from 'react';
import { fmtClockHM } from '../utils/format';

export function StatusBar() {
  const [time, setTime] = useState(() => fmtClockHM(new Date()));

  useEffect(() => {
    const tick = () => setTime(fmtClockHM(new Date()));
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  return (
    <div className="status-bar">
      <div className="time">{time}</div>
      <div className="island" />
      <div className="right">
        <svg viewBox="0 0 18 12" fill="currentColor" style={{ width: 18, height: 12 }}>
          <rect x="0" y="8" width="3" height="4" rx="0.5" />
          <rect x="5" y="6" width="3" height="6" rx="0.5" />
          <rect x="10" y="3" width="3" height="9" rx="0.5" />
          <rect x="15" y="0" width="3" height="12" rx="0.5" />
        </svg>
        <svg viewBox="0 0 16 12" fill="currentColor" style={{ width: 15, height: 11 }}>
          <path d="M8 11.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z" />
          <path d="M8 7.5c1.4 0 2.7.5 3.7 1.4l1.5-1.5A8 8 0 0 0 8 5.3a8 8 0 0 0-5.2 2.1l1.5 1.5A5.4 5.4 0 0 1 8 7.5Z" />
          <path d="M8 3.6a10.4 10.4 0 0 1 7.4 3l-1.5 1.5A8.4 8.4 0 0 0 8 5.6a8.4 8.4 0 0 0-5.9 2.5L0.6 6.6A10.4 10.4 0 0 1 8 3.6Z" />
        </svg>
        <svg viewBox="0 0 26 12" fill="none" style={{ width: 24, height: 11 }}>
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="16" height="8" rx="1.5" fill="currentColor" />
          <rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}
