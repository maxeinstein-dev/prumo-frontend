import { useEffect, useState } from 'react';
import { dayKeyOf, refreshDay } from '../utils/currentDay';

/**
 * The local day (yyyy-MM-dd), refreshed when the app becomes visible again (on the phone it stays days in the
 * background). Re-renders only when the day actually changed.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => dayKeyOf(new Date()));
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setToday((known) => refreshDay(known, new Date()));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return today;
}
