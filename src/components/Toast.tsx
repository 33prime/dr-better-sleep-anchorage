import { useEffect, useState } from 'react';

let setterRef: ((msg: string) => void) | null = null;

export function showToast(msg: string) {
  setterRef?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setterRef = (m) => {
      setMsg(m);
      setShow(true);
      window.clearTimeout((setterRef as any).__t);
      (setterRef as any).__t = window.setTimeout(() => setShow(false), 2200);
    };
    return () => { setterRef = null; };
  }, []);

  if (!msg) return null;
  return <div className={`toast ${show ? 'show' : ''}`}>{msg}</div>;
}
