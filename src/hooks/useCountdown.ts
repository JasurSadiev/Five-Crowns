import { useEffect, useState } from 'react';
import { toDate } from '../utils/formatting';
import type { AnyTimestamp } from '../types/game';

/** Seconds remaining until a server timestamp, ticking once per second. */
export function useCountdown(deadline: AnyTimestamp | undefined): number | null {
  const target = toDate(deadline)?.getTime() ?? null;
  const [remaining, setRemaining] = useState<number | null>(() =>
    target ? Math.max(0, Math.round((target - Date.now()) / 1000)) : null,
  );

  useEffect(() => {
    if (!target) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return remaining;
}
