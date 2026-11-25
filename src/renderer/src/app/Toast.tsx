import { useEffect, useState } from 'react';
import { useToast } from './toast-store';

/** One short message at a time, top centre; fades after a few seconds. */
export function Toast() {
  const { id, text, detail, tone } = useToast();
  // The toast with this id has timed out (derived, so no state is set during the effect).
  const [expired, setExpired] = useState(-1);
  const shown = expired !== id;

  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setExpired(id), detail ? 6500 : 4000);
    return () => clearTimeout(t);
  }, [id, text, detail]);

  return (
    <div
      className={`toast toast--${tone} ${shown && text ? 'is-shown' : ''}`}
      role="status"
      aria-live="polite"
      data-testid="toast"
    >
      <span className="toast__dot" />
      <div>
        <div className="toast__text">{text}</div>
        {detail && <div className="toast__detail">{detail}</div>}
      </div>
    </div>
  );
}
