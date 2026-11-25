import { useId, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { transferAccounts, transferBody, type TransferBody, type TransferCaptureLike } from '../../utils/captureTransfer';

const TOUCH = 'min-h-[44px]';
const SELECT = `${TOUCH} w-full rounded-xl border border-rc-line bg-rc-card px-3 text-sm text-rc-ink`;

interface CaptureTransferBlockProps {
  item: TransferCaptureLike;
  /** The accounts a Pix can leave from or arrive at (no credit card). */
  accounts: Array<{ id: string; name: string; label?: string }>;
  canEdit: boolean;
  busy: boolean;
  onConfirm: (body: TransferBody) => void;
  onDismissBoth: () => void;
  /** Dismisses only this capture, when the pair is wrong (e.g. an e-mail that repeats another notification). */
  onDismissOne: () => void;
}

/**
 * A Pix between two accounts of the user (P16, decided on 15/11/2026): the outflow and the income of the same Pix are
 * shown once, as one transfer. "Lançar transferência" confirms both captures as a transfer (no income, no expense);
 * "Descartar as duas" dismisses both. The accounts come from the two suggestions and can be changed here, so a Google
 * Pay Pix (which names no bank) is filled in place. Used by the captures page and by the phone's capture box.
 */
const CaptureTransferBlock = ({ item, accounts, canEdit, busy, onConfirm, onDismissBoth, onDismissOne }: CaptureTransferBlockProps) => {
  const initial = transferAccounts(item);
  const [fromAccountId, setFrom] = useState<string>(initial.fromAccountId ?? '');
  const [toAccountId, setTo] = useState<string>(initial.toAccountId ?? '');
  const ids = { from: useId(), to: useId(), hint: useId() };
  const result = transferBody(item, { fromAccountId, toAccountId });
  const hint = !result.ok && result.missing.includes('same')
    ? 'Escolha contas diferentes.'
    : !result.ok && (result.missing.includes('from') || result.missing.includes('to'))
      ? 'Escolha as duas contas.'
      : null;

  return (
    <div role="group" aria-label="Pix entre suas contas" className="space-y-2 rounded-xl bg-rc-accentSoft p-3" data-testid="capture-transfer">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-rc-accentInk">
        <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
        Pix entre suas contas
      </p>
      <p className="text-xs text-rc-ink2">A saída e a entrada deste Pix viram uma transferência: sem receita nem despesa.</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={ids.from} className="text-xs text-rc-ink2">De</label>
          <select id={ids.from} value={fromAccountId} disabled={!canEdit || busy} onChange={(e) => setFrom(e.target.value)} className={SELECT} aria-describedby={hint ? ids.hint : undefined}>
            <option value="">Escolher</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label ?? a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={ids.to} className="text-xs text-rc-ink2">Para</label>
          <select id={ids.to} value={toAccountId} disabled={!canEdit || busy} onChange={(e) => setTo(e.target.value)} className={SELECT} aria-describedby={hint ? ids.hint : undefined}>
            <option value="">Escolher</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label ?? a.name}</option>)}
          </select>
        </div>
      </div>
      {hint && <p id={ids.hint} className="text-xs font-medium text-rc-amber">{hint}</p>}
      {canEdit && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onDismissBoth}
            className={`${TOUCH} flex-1 rounded-xl border border-rc-line px-3 text-sm font-medium text-rc-ink2 disabled:opacity-50`}
          >
            Descartar as duas
          </button>
          <button
            type="button"
            disabled={busy || !result.ok}
            onClick={() => result.ok && onConfirm(result.body)}
            className={`${TOUCH} flex-1 rounded-xl bg-rc-accent px-3 text-sm font-semibold text-rc-onAccent disabled:opacity-50`}
          >
            {busy ? 'Lançando…' : 'Lançar transferência'}
          </button>
        </div>
      )}
      {canEdit && (
        <button
          type="button"
          disabled={busy}
          onClick={onDismissOne}
          className={`${TOUCH} w-full text-center text-xs font-medium text-rc-ink2 underline-offset-2 hover:underline disabled:opacity-50`}
        >
          Não é este par: descartar só esta
        </button>
      )}
    </div>
  );
};

export default CaptureTransferBlock;
