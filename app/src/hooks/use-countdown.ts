import { useCallback, useEffect, useState } from 'react';

/**
 * Seconds left until something, counting down once per second.
 * start(n) restarts it at n seconds (e.g. after a new code was sent).
 */
export function useCountdown(initialSeconds = 0) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + initialSeconds * 1000);
  const [left, setLeft] = useState(initialSeconds);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    setEndsAt(Date.now() + seconds * 1000);
    setLeft(seconds);
  }, []);

  return { left, start };
}
