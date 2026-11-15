import { useState } from 'react';
import { Wallet } from 'lucide-react';
import PurchaseSimulator from './PurchaseSimulator';
import { formatCurrency } from '../../utils/format';
import type { CashFlowResponse } from '../../utils/cashFlow';
import type { CashFlowTextKey } from '../../utils/cashFlowTexts';
import { spendableLines, spendableView } from '../../utils/spendable';

interface SpendableCardProps {
  data: Pick<CashFlowResponse, 'period' | 'summary'> | null | undefined;
  currency: string;
  tx: (key: CashFlowTextKey, vars?: Record<string, string | number>) => string;
  /** 'shell': the mobile shell (rc tokens); 'web': the desktop page (gray / dark classes). */
  variant: 'shell' | 'web';
  testId?: string;
  /** Shows the "Simular compra" button and its panel (P20). */
  simulator?: boolean;
}

const STYLE = {
  shell: {
    card: 'rounded-2xl border border-rc-line bg-rc-card p-4',
    icon: 'text-rc-ink2',
    title: 'text-sm font-semibold text-rc-ink',
    value: 'text-2xl font-bold',
    positive: 'text-rc-ink',
    zero: 'text-rc-red',
    detail: 'text-sm text-rc-ink2',
    note: 'text-xs text-rc-ink2',
    button: 'mt-3 min-h-[44px] w-full rounded-xl border border-rc-line bg-rc-card2 px-3 text-sm font-semibold text-rc-ink',
  },
  web: {
    card: 'rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4',
    icon: 'text-gray-500 dark:text-gray-400',
    title: 'text-sm font-medium text-gray-900 dark:text-white',
    value: 'text-2xl font-semibold',
    positive: 'text-gray-900 dark:text-white',
    zero: 'text-red-600 dark:text-red-400',
    detail: 'text-sm font-light text-gray-600 dark:text-gray-300',
    note: 'text-xs font-light text-gray-500 dark:text-gray-400',
    button: 'mt-3 min-h-[44px] w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800',
  },
} as const;

/**
 * "Pode gastar até DD/MM: R$ X" (P07): the lowest free balance until the next known income, as the server computed it.
 * Without an income in the period it says so instead of a number; with an older backend it is not shown at all.
 */
export default function SpendableCard({ data, currency, tx, variant, testId = 'spendable-card', simulator = false }: SpendableCardProps) {
  const [simulating, setSimulating] = useState(false);
  const view = spendableView(data);
  if (!view) return null;
  const lines = spendableLines(view, tx, (cents) => formatCurrency(cents / 100, currency));
  const s = STYLE[variant];
  const titleId = `${testId}-title`;
  return (
    <section className={s.card} aria-labelledby={titleId} data-testid={testId}>
      <div className="flex items-center gap-2">
        <Wallet className={`h-4 w-4 flex-none ${s.icon}`} aria-hidden="true" />
        <h2 id={titleId} className={s.title}>{lines.title}</h2>
      </div>
      {lines.value !== null && (
        <p className={`mt-1 tabular-nums ${s.value} ${view.kind === 'amount' && view.zero ? s.zero : s.positive}`} data-testid={`${testId}-value`}>
          {lines.value}
        </p>
      )}
      <p className={`mt-1 break-words ${s.detail}`}>{lines.detail}</p>
      <p className={`mt-1 ${s.note}`}>{lines.note}</p>
      {simulator && (
        <>
          <button type="button" onClick={() => setSimulating(true)} className={s.button} data-testid={`${testId}-simulate`}>
            Simular compra
          </button>
          <PurchaseSimulator open={simulating} onClose={() => setSimulating(false)} currency={currency} />
        </>
      )}
    </section>
  );
}
