import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Effective closing day: closingDay ?? (dueDay ? wrap(dueDay - 7) : null), and the form rule that fills the closing
// field from the due day (utils/closingDay.ts). CLOSING_DAY_MODULE points at a mutated copy for the bite-checks;
// CARD_QUEUE_MODULE (shared with the unified-import suite) at a copy of utils/cardOfxQueue.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const load = async (envName: string, rel: string): Promise<Any> => import(pathToFileURL(process.env[envName] || frontSrc(rel)).href);
const C = await load('CLOSING_DAY_MODULE', 'utils/closingDay.ts');
const CQ = await load('CARD_QUEUE_MODULE', 'utils/cardOfxQueue.ts');

console.log('\n[CD] closing day derived from the due day');

check('CD-a: closing = due - 7, wrapping into the previous month with +30 (3 -> 26, 7 -> 30)', () => {
  const expected: Array<[number, number]> = [[9, 2], [8, 1], [7, 30], [3, 26], [1, 24], [31, 24], [15, 8], [2, 25]];
  for (const [due, closing] of expected) assert.equal(C.closingDayFromDue(due), closing, `due ${due}`);
});

check('CD-b: no valid due day, no suggestion', () => {
  for (const bad of [null, undefined, 0, 32, -1, 1.5, Number.NaN]) assert.equal(C.closingDayFromDue(bad), null, String(bad));
});

check('CD-c: effectiveClosingDay prefers the explicit day, derives otherwise, null with neither', () => {
  assert.equal(C.effectiveClosingDay({ closingDay: 20, dueDay: 9 }), 20);
  assert.equal(C.effectiveClosingDay({ closingDay: null, dueDay: 9 }), 2);
  assert.equal(C.effectiveClosingDay({ dueDay: 3 }), 26);
  assert.equal(C.effectiveClosingDay({ closingDay: 0, dueDay: 31 }), 24, 'a 0 closing day counts as absent');
  assert.equal(C.effectiveClosingDay({ closingDay: null, dueDay: null }), null);
  assert.equal(C.effectiveClosingDay({}), null);
  assert.equal(C.effectiveClosingDay(undefined), null);
});

check('CD-d: a purchase on or after the effective closing day goes to the next invoice (derived day included)', () => {
  // The rule the installments use. Due 9 -> closes on 2.
  const lands = (card: Any, day: number) => {
    const closing = C.effectiveClosingDay(card);
    return closing !== null && day >= closing ? 'next' : 'same';
  };
  assert.equal(lands({ dueDay: 9 }, 1), 'same');
  assert.equal(lands({ dueDay: 9 }, 2), 'next');
  assert.equal(lands({ dueDay: 9, closingDay: 20 }, 10), 'same');
  assert.equal(lands({}, 28), 'same', 'neither day: calendar month, nothing moves');
});

console.log('\n[CF] closing field follows the due field');

// Simulates the user typing: each step is a change of the due day, optionally preceded by the user typing a closing day.
type Step = { due?: number; typedClosing?: number | 'clear' };
function run(steps: Step[], initial: { closing?: number; lastSuggested?: number | null } = {}) {
  let closing: number | undefined = initial.closing;
  let last: number | null = initial.lastSuggested ?? null;
  let due: number | undefined;
  const trace: Array<number | undefined> = [];
  for (const s of steps) {
    if (s.typedClosing !== undefined) closing = s.typedClosing === 'clear' ? undefined : s.typedClosing;
    if ('due' in s) due = s.due;
    const r = C.autoFillClosingDay({ dueDay: due, closingDay: closing, lastSuggested: last });
    closing = r.closingDay;
    last = r.suggested;
    trace.push(closing);
  }
  return trace;
}

check('CF-a: typing the due day fills the empty closing day (9 -> 2) and keeps following it while it is the suggestion', () => {
  assert.deepEqual(run([{ due: 9 }]), [2]);
  assert.deepEqual(run([{ due: 1 }, { due: 19 }, { due: 3 }]), [24, 12, 26], 'typing 1 then 19 then 3');
});

check('CF-b: a closing day typed by the user is kept when the due day changes', () => {
  assert.deepEqual(run([{ due: 9 }, { typedClosing: 20 }, { due: 10 }, { due: 11 }]), [2, 20, 20, 20]);
  assert.deepEqual(run([{ typedClosing: 15 }, { due: 9 }]), [15, 15], 'typed before the due day');
});

check('CF-c: typing the suggested value itself keeps it following the due day (same as untouched)', () => {
  assert.deepEqual(run([{ due: 9 }, { typedClosing: 2 }, { due: 12 }]), [2, 2, 5]);
});

check('CF-d: clearing the due day clears an automatic closing day, not a typed one; a cleared closing is filled again', () => {
  assert.deepEqual(run([{ due: 9 }, { due: undefined }]), [2, undefined]);
  assert.deepEqual(run([{ due: 9 }, { typedClosing: 20 }, { due: undefined }]), [2, 20, 20]);
  assert.deepEqual(run([{ due: 9 }, { typedClosing: 'clear', due: 10 }]), [2, 3]);
});

check('CF-e: editing a saved card: a closing day equal to the old suggestion follows, a custom one does not', () => {
  // Saved due 9 / closing 2: the form remembers the rule for the saved due day.
  assert.deepEqual(run([{ due: 10 }], { closing: 2, lastSuggested: 2 }), [3]);
  assert.deepEqual(run([{ due: 10 }], { closing: 20, lastSuggested: 2 }), [20]);
  // The hook starts with no memory: the first run only remembers the suggestion and never overwrites a value.
  assert.deepEqual(run([{ due: 9 }], { closing: 20, lastSuggested: null }), [20]);
});

check('CF-f: the suggestion is exposed for the placeholder', () => {
  assert.equal(C.autoFillClosingDay({ dueDay: 9, closingDay: 20, lastSuggested: null }).suggested, 2);
  assert.equal(C.autoFillClosingDay({ dueDay: undefined, closingDay: undefined, lastSuggested: 2 }).suggested, null);
});

console.log('\n[CN] invoice import notices');

check('CN-a: lacksClosingDay is true only with neither a closing day nor a due day', () => {
  assert.equal(CQ.lacksClosingDay({ closingDay: null, dueDay: null }), true);
  assert.equal(CQ.lacksClosingDay({}), true);
  assert.equal(CQ.lacksClosingDay({ closingDay: null, dueDay: 9 }), false, 'derived');
  assert.equal(CQ.lacksClosingDay({ closingDay: 2, dueDay: null }), false);
  assert.equal(CQ.lacksClosingDay(undefined), false, 'accounts not loaded yet: no notice');
});

check('CN-b: derivedClosingNotice names the computed day only when it is derived', () => {
  assert.equal(CQ.derivedClosingNotice({ closingDay: null, dueDay: 9 }), 'Fechamento calculado: dia 2 (7 dias antes do vencimento)');
  assert.equal(CQ.derivedClosingNotice({ dueDay: 3 }), 'Fechamento calculado: dia 26 (7 dias antes do vencimento)');
  assert.equal(CQ.derivedClosingNotice({ closingDay: 2, dueDay: 9 }), null, 'stored closing day');
  assert.equal(CQ.derivedClosingNotice({ closingDay: null, dueDay: null }), null, 'nothing to derive from');
  assert.equal(CQ.derivedClosingNotice(undefined), null);
});

check('CN-c: the server warning for a card with neither day is still recognised (old and new wording)', () => {
  assert.equal(CQ.isClosingDayServerWarning('O cartão "X" não tem dia de fechamento nem de vencimento configurado: no Recta as faturas seguem o mês calendário'), true);
  assert.equal(CQ.isClosingDayServerWarning('O cartão "X" não tem dia de fechamento configurado: no Recta as faturas'), true);
});
