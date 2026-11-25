/**
 * "Today" as the screens read it. The app lives for days in the background on the phone, so the day taken when the
 * screen mounted goes stale; the hook asks again when the app becomes visible. Only what means "today / current month"
 * is refreshed: a month the user chose by hand is never touched (the selected month lives elsewhere). No React and no
 * imports, so tools/fe-tests/t64_current_day.mts runs it under tsx (CURRENT_DAY_MODULE points it at a mutated copy).
 */

/** The local day of `now` as yyyy-MM-dd. */
export function dayKeyOf(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The month (yyyy-MM) of a day key. */
export function monthOfDayKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** The day to hold after a look at the clock: the new one when the day changed, the same value (no re-render) otherwise. */
export function refreshDay(known: string, now: Date): string {
  const current = dayKeyOf(now);
  return current === known ? known : current;
}
