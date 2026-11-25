import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { monthKeyOf, shiftMonthKey } from '../utils/mobileShell';
import { monthOfDayKey } from '../utils/currentDay';
import { useToday } from '../hooks/useToday';

/**
 * The month chosen in the mobile header. Starts at the current month each time the app opens (state lives in memory,
 * nothing is stored). Only screens that declare they use the selector read it (utils/mobileShell MONTH_SELECTOR_SCREENS).
 */
interface SelectedMonthValue {
  monthKey: string;
  isCurrentMonth: boolean;
  previousMonth: () => void;
  nextMonth: () => void;
  goToCurrentMonth: () => void;
  /** Sets the month directly. Used by the Cartões screen to open the invoice that matters (and to give the month back). */
  setMonthKey: (key: string) => void;
}

const SelectedMonthContext = createContext<SelectedMonthValue | undefined>(undefined);

export const SelectedMonthProvider = ({ children }: { children: ReactNode }) => {
  // "Current month" follows the clock: it is asked again when the app becomes visible (on the phone it stays days in the
  // background). The month on display is never moved by that: if the month turned while the app slept, the screen stays
  // where it was and only "is this the current month?" changes (the header then offers the way back to the new one).
  const currentKey = monthOfDayKey(useToday());
  const [monthKey, setMonthKey] = useState<string>(currentKey);

  const previousMonth = useCallback(() => setMonthKey((k) => shiftMonthKey(k, -1)), []);
  const nextMonth = useCallback(() => setMonthKey((k) => shiftMonthKey(k, 1)), []);
  const goToCurrentMonth = useCallback(() => setMonthKey(monthKeyOf(new Date())), []);

  const value = useMemo<SelectedMonthValue>(
    () => ({
      monthKey,
      isCurrentMonth: monthKey === currentKey,
      previousMonth,
      nextMonth,
      goToCurrentMonth,
      setMonthKey,
    }),
    [monthKey, currentKey, previousMonth, nextMonth, goToCurrentMonth],
  );

  return <SelectedMonthContext.Provider value={value}>{children}</SelectedMonthContext.Provider>;
};

export const useSelectedMonth = (): SelectedMonthValue => {
  const context = useContext(SelectedMonthContext);
  if (context === undefined) {
    throw new Error('useSelectedMonth must be used within a SelectedMonthProvider');
  }
  return context;
};
