import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// PEOPLE_MODULE points at a mutated copy of utils/people.ts (bite-checks), next to a copy of maxfinPayload.ts.
const modPath = process.env.PEOPLE_MODULE || frontSrc('utils/people.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: any = await import(pathToFileURL(modPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const row = (key: string, o: Record<string, string> = {}): Any => ({ key, personId: key, amountText: '', percentText: '', sharesText: '1', note: '', ...o });
const draft = (strategy: string, rows: Any[], o: Record<string, unknown> = {}): Any => ({ direction: 'THEY_OWE_ME', strategy, myShares: '1', rows, ...o });
const parts = (total: number, d: Any): Array<number | null> => P.computeSharePreview(total, d).parts.map((p: Any) => p.cents);

console.log('\n[P1] money, percent and share inputs (integer cents)');

check('parseMoneyToCents: the pt-BR and plain spellings of an amount', () => {
  const cases: Array<[string, number | null]> = [
    ['12', 1200], ['12,5', 1250], ['12.50', 1250], ['1.234,56', 123456], ['R$ 1.234,56', 123456], ['1.234', 123400], ['0,01', 1], ['0', 0],
    ['  7,05 ', 705], ['1.234.567,89', 123456789],
    ['-5', null], ['12,345', null], ['abc', null], ['', null], ['1,2,3', null], ['12.345', 1234500], ['9999999999', null], ['1e3', null],
  ];
  for (const [text, want] of cases) assert.equal(P.parseMoneyToCents(text), want, `"${text}"`);
});

check('formatCentsInput round-trips parseMoneyToCents', () => {
  assert.equal(P.formatCentsInput(1250), '12,50');
  assert.equal(P.formatCentsInput(5), '0,05');
  assert.equal(P.formatCentsInput(0), '0,00');
  for (const cents of [1, 99, 100, 1999, 123456, 999999999]) assert.equal(P.parseMoneyToCents(P.formatCentsInput(cents)), cents);
});

check('percent: hundredths of a percent, 0,01 to 100,00 only', () => {
  const cases: Array<[string, number | null]> = [['50', 5000], ['33,33', 3333], ['33.3', 3330], ['100', 10000], ['12%', 1200], ['0,01', 1], ['100,01', null], ['0', null], ['0,001', null], ['abc', null], ['-5', null], ['', null]];
  for (const [text, want] of cases) assert.equal(P.parsePercentToHundredths(text), want, `"${text}"`);
  assert.equal(P.formatHundredthsInput(5000), '50');
  assert.equal(P.formatHundredthsInput(3333), '33,33');
  assert.equal(P.formatHundredthsInput(3330), '33,3');
  assert.equal(P.formatHundredthsInput(5), '0,05');
});

check('shares are whole numbers from 1 to 1000 (the server schema); my own shares from 0 to 1000', () => {
  assert.equal(P.parseSharesText('2'), 2);
  assert.equal(P.parseSharesText(' 3 '), 3);
  assert.equal(P.parseSharesText('1000'), 1000);
  for (const bad of ['0', '1,5', '', '-1', 'x', '1001', '1234567']) assert.equal(P.parseSharesText(bad), null, bad);
  assert.equal(P.parseMySharesText('0'), 0);
  assert.equal(P.parseMySharesText('1000'), 1000);
  for (const bad of ['1001', '', '-1', '1,5', 'x']) assert.equal(P.parseMySharesText(bad), null, bad);
  assert.deepEqual([P.MAX_SHARES, P.MAX_SPLIT_ENTRIES, P.MAX_ALIASES, P.MAX_PERSON_NAME, P.MAX_NOTE], [1000, 50, 20, 100, 500]);
});

check('reais <-> cents never drift on 2-decimal values', () => {
  for (let c = 0; c <= 20000; c += 7) assert.equal(P.reaisToCents(P.centsToReais(c)), c, `cents ${c}`);
  assert.equal(P.reaisToCents(0.29), 29);
  assert.equal(P.reaisToCents(19.99), 1999);
  assert.equal(P.reaisToCents(-12.34), -1234);
});

check('moneyText: thousands dots, comma decimals, sign in front', () => {
  assert.equal(P.moneyText(1234567), 'R$ 12.345,67');
  assert.equal(P.moneyText(5), 'R$ 0,05');
  assert.equal(P.moneyText(-250), '-R$ 2,50');
  assert.equal(P.signedMoneyText(250), '+R$ 2,50');
  assert.equal(P.signedMoneyText(-250), '-R$ 2,50');
  assert.equal(P.signedMoneyText(0), 'R$ 0,00');
});

console.log('\n[P2] split strategies (the live preview mirrors the server rule)');

check('equal: I count as one of the participants; the remainder goes to the FIRST person', () => {
  assert.deepEqual(parts(10000, draft('equal', [row('a'), row('b'), row('c')])), [2500, 2500, 2500]);
  const p = P.computeSharePreview(1000, draft('equal', [row('a'), row('b')]));
  assert.deepEqual(p.parts.map((x: Any) => x.cents), [334, 333]);
  assert.equal(p.restCents, 333, 'my part is the rounded-down one');
  assert.equal(p.sumCents + p.restCents, 1000);
  assert.deepEqual(parts(100, draft('equal', [row('a'), row('b'), row('c')])), [25, 25, 25], '100 / 4 divides: no remainder');
});

check('equal: the remainder really is added to the first (10 cents among me + 3)', () => {
  assert.deepEqual(parts(10, draft('equal', [row('a'), row('b'), row('c')])), [4, 2, 2]);
  assert.equal(P.computeSharePreview(10, draft('equal', [row('a'), row('b'), row('c')])).restCents, 2);
});

check('equal: a part that rounds to zero is an error on that row, not a silent 0', () => {
  const p = P.computeSharePreview(1, draft('equal', [row('a'), row('b')]));
  assert.equal(p.valid, false);
  assert.equal(p.parts[0].error, null, 'the first one gets the cent');
  assert.equal(p.parts[1].error, P.SHARE_MESSAGES.zeroPart);
});

check('shares: myShares counts in the denominator; remainder to the first person', () => {
  const d = draft('shares', [row('a', { sharesText: '2' }), row('b', { sharesText: '1' })], { myShares: '1' });
  const p = P.computeSharePreview(10000, d);
  assert.deepEqual(p.parts.map((x: Any) => x.cents), [5000, 2500]);
  assert.equal(p.restCents, 2500);
  const q = P.computeSharePreview(1000, draft('shares', [row('a'), row('b')], { myShares: '1' }));
  assert.deepEqual(q.parts.map((x: Any) => x.cents), [334, 333]);
  assert.equal(q.restCents, 333);
  const r = P.computeSharePreview(10000, draft('shares', [row('a', { sharesText: '1' })], { myShares: '3' }));
  assert.deepEqual(r.parts.map((x: Any) => x.cents), [2500], 'I hold 3 of 4 shares');
  assert.equal(r.restCents, 7500);
});

check('percent: of the total; the rest is mine; a remainder only exists when the percentages cover 100%', () => {
  const one = P.computeSharePreview(10001, draft('percent', [row('a', { percentText: '50' })]));
  assert.deepEqual(one.parts.map((x: Any) => x.cents), [5000]);
  assert.equal(one.restCents, 5001, 'I keep the odd cent');
  const all = P.computeSharePreview(10001, draft('percent', [row('a', { percentText: '50' }), row('b', { percentText: '50' })]));
  assert.deepEqual(all.parts.map((x: Any) => x.cents), [5001, 5000], 'covered: the first takes the remainder');
  assert.equal(all.restCents, 0);
  const frac = P.computeSharePreview(9999, draft('percent', [row('a', { percentText: '33,33' })]));
  assert.deepEqual(frac.parts.map((x: Any) => x.cents), [3332], 'floor(9999 * 3333 / 10000)');
});

check('exact: the parts are the typed amounts and may add up to the whole transaction', () => {
  const p = P.computeSharePreview(10000, draft('exact', [row('a', { amountText: '60,00' }), row('b', { amountText: '40' })]));
  assert.equal(p.valid, true);
  assert.deepEqual(p.parts.map((x: Any) => x.cents), [6000, 4000]);
  assert.equal(p.restCents, 0);
});

check('the sum above the transaction is refused with both amounts in the message', () => {
  const p = P.computeSharePreview(10000, draft('exact', [row('a', { amountText: '60,00' }), row('b', { amountText: '50,00' })]));
  assert.equal(p.valid, false);
  assert.equal(p.formError, 'As partes somam R$ 110,00, mais que o valor da transação (R$ 100,00).');
  const exactly = P.computeSharePreview(10000, draft('exact', [row('a', { amountText: '100,00' })]));
  assert.equal(exactly.valid, true, 'equal to the total is fine');
  const oneCentOver = P.computeSharePreview(10000, draft('exact', [row('a', { amountText: '100,01' })]));
  assert.equal(oneCentOver.valid, false);
});

check('row validation: missing person, duplicate person, amount, percent, shares', () => {
  const noPerson = P.computeSharePreview(1000, draft('equal', [row('a', { personId: '' })]));
  assert.equal(noPerson.parts[0].error, P.SHARE_MESSAGES.noPerson);
  const dup = P.computeSharePreview(1000, draft('equal', [row('a'), row('x', { personId: 'a' })]));
  assert.equal(dup.parts[0].error, null);
  assert.equal(dup.parts[1].error, P.SHARE_MESSAGES.duplicate);
  assert.equal(dup.valid, false);
  assert.equal(P.computeSharePreview(1000, draft('exact', [row('a', { amountText: '0' })])).parts[0].error, P.SHARE_MESSAGES.amount);
  assert.equal(P.computeSharePreview(1000, draft('exact', [row('a', { amountText: '' })])).parts[0].error, P.SHARE_MESSAGES.amount);
  assert.equal(P.computeSharePreview(1000, draft('percent', [row('a', { percentText: '0' })])).parts[0].error, P.SHARE_MESSAGES.percent);
  assert.equal(P.computeSharePreview(1000, draft('shares', [row('a', { sharesText: '0' })])).parts[0].error, P.SHARE_MESSAGES.shares);
  assert.equal(P.computeSharePreview(1000, draft('shares', [row('a')], { myShares: 'x' })).formError, P.SHARE_MESSAGES.myShares);
  assert.equal(P.computeSharePreview(1000, draft('shares', [row('a', { sharesText: '1001' })])).parts[0].error, P.SHARE_MESSAGES.shares);
  assert.equal(P.computeSharePreview(1000, draft('shares', [row('a')], { myShares: '1001' })).formError, P.SHARE_MESSAGES.myShares);
  const noShareOfMine = P.computeSharePreview(1000, draft('shares', [row('a'), row('b', { sharesText: '3' })], { myShares: '0' }));
  assert.equal(noShareOfMine.valid, true, 'the server accepts myShares 0: the people pay it all');
  assert.deepEqual(noShareOfMine.parts.map((p: Any) => p.cents), [250, 750]);
  assert.equal(noShareOfMine.restCents, 0);
});

check('more than 50 people in a division is refused (the server cap)', () => {
  const many = (n: number) => draft('equal', Array.from({ length: n }, (_, i) => row(`p${i}`)));
  assert.equal(P.computeSharePreview(100000, many(50)).valid, true);
  const over = P.computeSharePreview(100000, many(51));
  assert.equal(over.valid, false);
  assert.equal(over.formError, P.SHARE_MESSAGES.tooMany);
});

check('percentages above 100% in total are refused', () => {
  const p = P.computeSharePreview(1000, draft('percent', [row('a', { percentText: '60' }), row('b', { percentText: '50' })]));
  assert.equal(p.valid, false);
  assert.equal(p.formError, P.SHARE_MESSAGES.percentOver);
  assert.equal(P.computeSharePreview(1000, draft('percent', [row('a', { percentText: '60' }), row('b', { percentText: '40' })])).valid, true);
});

check('no rows is a valid "clear"; a transaction without value cannot be divided', () => {
  const empty = P.computeSharePreview(1000, draft('equal', []));
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.valid, true);
  assert.equal(P.buildPutSharesInput(1000, draft('equal', [])), null, 'a clear is not a PUT body of a division');
  const noTotal = P.computeSharePreview(0, draft('equal', [row('a')]));
  assert.equal(noTotal.valid, false);
  assert.equal(noTotal.formError, P.SHARE_MESSAGES.noTotal);
});

check('invariant on 600 random drafts: parts + my rest add up to the total, every part > 0, never above the total', () => {
  let seed = 12345;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const strategies = ['equal', 'exact', 'percent', 'shares'];
  let validCount = 0;
  for (let i = 0; i < 600; i += 1) {
    const total = 1 + rnd(200000);
    const strategy = strategies[rnd(4)];
    const n = 1 + rnd(5);
    const rows = Array.from({ length: n }, (_, k) => row(`p${k}`, {
      amountText: P.formatCentsInput(1 + rnd(total)),
      percentText: String(1 + rnd(40)),
      sharesText: String(1 + rnd(5)),
    }));
    const p = P.computeSharePreview(total, draft(strategy, rows, { myShares: String(1 + rnd(4)) }));
    if (!p.valid) continue;
    validCount += 1;
    assert.equal(p.sumCents + p.restCents, total, `${strategy} total ${total}`);
    assert.ok(p.sumCents <= total && p.restCents >= 0, `${strategy} total ${total}`);
    for (const part of p.parts) assert.ok(part.cents > 0, `${strategy} part > 0 (total ${total})`);
  }
  assert.ok(validCount > 150, `enough valid drafts exercised (${validCount})`);
});

console.log('\n[P3] the PUT body');

check('exact: personId, amount in reais, trimmed note; nothing of the other strategies', () => {
  const d = draft('exact', [row('a', { amountText: '12,50', note: '  almoço ' }), row('b', { amountText: '7' })]);
  assert.deepEqual(P.buildPutSharesInput(10000, d), {
    direction: 'THEY_OWE_ME', strategy: 'exact', entries: [{ personId: 'a', amount: 12.5, note: 'almoço' }, { personId: 'b', amount: 7 }],
  });
});

check('percent: percent as a number of percent; shares: shares + myShares; equal: only the people', () => {
  assert.deepEqual(P.buildPutSharesInput(10000, draft('percent', [row('a', { percentText: '33,33' })])), {
    direction: 'THEY_OWE_ME', strategy: 'percent', entries: [{ personId: 'a', percent: 33.33 }],
  });
  assert.deepEqual(P.buildPutSharesInput(10000, draft('shares', [row('a', { sharesText: '2' })], { myShares: '3' })), {
    direction: 'THEY_OWE_ME', strategy: 'shares', entries: [{ personId: 'a', shares: 2 }], myShares: 3,
  });
  const equal = P.buildPutSharesInput(10000, draft('equal', [row('a', { amountText: '99', percentText: '9', sharesText: '9' })], { direction: 'I_OWE_THEM', myShares: '9' }));
  assert.deepEqual(equal, { direction: 'I_OWE_THEM', strategy: 'equal', entries: [{ personId: 'a' }] });
});

check('an invalid draft has no body; clearSharesInput removes one direction', () => {
  assert.equal(P.buildPutSharesInput(10000, draft('exact', [row('a', { amountText: '' })])), null);
  assert.equal(P.buildPutSharesInput(1000, draft('exact', [row('a', { amountText: '20' })])), null, 'above the total');
  assert.deepEqual(P.clearSharesInput('I_OWE_THEM'), { direction: 'I_OWE_THEM', strategy: 'exact', entries: [] });
});

check('convertDraftStrategy: the computed parts survive the switch', () => {
  const equal = draft('equal', [row('a'), row('b')]);
  const toExact = P.convertDraftStrategy(equal, 'exact', 1000);
  assert.equal(toExact.strategy, 'exact');
  assert.deepEqual(toExact.rows.map((r: Any) => r.amountText), ['3,34', '3,33']);
  const half = draft('exact', [row('a', { amountText: '50,00' })]);
  const toPercent = P.convertDraftStrategy(half, 'percent', 10000);
  assert.equal(toPercent.rows[0].percentText, '50');
  const broken = draft('exact', [row('a', { amountText: '' })]);
  const kept = P.convertDraftStrategy(broken, 'percent', 10000);
  assert.equal(kept.strategy, 'percent');
  assert.equal(kept.rows[0].percentText, '', 'nothing to carry over from an invalid row');
  assert.equal(P.convertDraftStrategy(half, 'exact', 10000), half, 'same strategy: same object');
});

check('convertDraftStrategy -> percent never changes the parts: a percentage that does not reproduce the part to the cent is left blank', () => {
  // 200.01 split with one person: she gets 100.01; no percentage with two decimals gives exactly that (50% is 100.00,
  // 50.01% is 100.03), so the field stays blank instead of silently changing the division.
  const one = draft('equal', [row('a')]);
  assert.equal(parts(20001, one)[0], 10001);
  const blank = P.convertDraftStrategy(one, 'percent', 20001);
  assert.equal(blank.rows[0].percentText, '');
  assert.equal(P.convertDraftStrategy(one, 'percent', 1000).rows[0].percentText, '50', 'exact: filled');
  // Rows that are exact one by one can still drift together: 3.33 + 6.67 of 10.01 are 33.27% + 66.73% = 100%, and at 100%
  // the remainder rule hands the leftover cent to the first person, who would then get 3.34.
  const together = draft('exact', [row('a', { amountText: '3,33' }), row('b', { amountText: '6,67' })]);
  assert.deepEqual(parts(1001, together), [333, 667]);
  const moved = P.convertDraftStrategy(together, 'percent', 1001);
  const movedParts = P.computeSharePreview(1001, moved);
  assert.ok(moved.rows.every((r: Any) => r.percentText === '') || (movedParts.valid && movedParts.parts[0].cents === 333), 'blank, or still 3.33');
  // Sweep: every total, 1 to 3 people, from equal and from exact: a filled field reproduces its part, and when every
  // field is filled the parts are the same as before.
  let filled = 0; let blanked = 0;
  for (let total = 100; total <= 20000; total += 7) {
    for (const k of [1, 2, 3]) {
      const rows = Array.from({ length: k }, (_, i) => row(`p${i}`));
      const sources = [draft('equal', rows)];
      const equalParts = parts(total, sources[0]) as number[];
      sources.push(draft('exact', rows.map((r, i) => ({ ...r, amountText: P.formatCentsInput(equalParts[i]) }))));
      for (const source of sources) {
        const before = parts(total, source) as number[];
        const after = P.convertDraftStrategy(source, 'percent', total);
        const preview = P.computeSharePreview(total, after);
        const texts = after.rows.map((r: Any) => r.percentText);
        if (texts.every((t: string) => t !== '')) {
          filled += 1;
          assert.ok(preview.valid, `valid: total ${total} k ${k}`);
          assert.deepEqual(preview.parts.map((x: Any) => x.cents), before, `total ${total} k ${k}`);
        } else {
          blanked += 1;
          texts.forEach((t: string, i: number) => {
            if (t === '') return;
            const h = P.parsePercentToHundredths(t);
            assert.equal(Math.floor((total * h) / 10000), before[i], `a filled field is exact: total ${total} k ${k}`);
          });
        }
      }
    }
  }
  assert.ok(filled > 100 && blanked > 100, `both outcomes exercised (${filled} filled, ${blanked} blank)`);
});

check('canWritePeople: a viewer or an unknown household cannot write; owner and editor can', () => {
  assert.equal(P.canWritePeople({ role: 'OWNER' }), true);
  assert.equal(P.canWritePeople({ role: 'EDITOR' }), true);
  assert.equal(P.canWritePeople({ role: 'VIEWER' }), false);
  assert.equal(P.canWritePeople(undefined), false);
  assert.equal(P.canWritePeople(null), false);
});

check('savedSharesMessage: "sua parte" when they owe me, what I owe the other way round', () => {
  const result = { myPart: 66.67, shares: [{ direction: 'THEY_OWE_ME', amount: 33.33 }, { direction: 'I_OWE_THEM', amount: 10 }, { direction: 'I_OWE_THEM', amount: 5.5 }] };
  assert.equal(P.savedSharesMessage('THEY_OWE_ME', result), 'Divisão salva. Sua parte: R$ 66,67.');
  assert.equal(P.savedSharesMessage('I_OWE_THEM', result), 'Divisão salva. Você deve R$ 15,50.');
});

check('draftFromShares / initialDirection: the stored division of one direction, as exact values', () => {
  const shares = [
    { id: 's1', transactionId: 't', personId: 'a', personName: 'Ana', direction: 'THEY_OWE_ME', amount: 12.5, note: 'x', source: 'manual' },
    { id: 's2', transactionId: 't', personId: 'b', personName: 'Bia', direction: 'I_OWE_THEM', amount: 3, note: null, source: 'import' },
  ];
  const mine = P.draftFromShares(shares, 'THEY_OWE_ME');
  assert.equal(mine.strategy, 'exact');
  assert.deepEqual(mine.rows.map((r: Any) => [r.personId, r.amountText, r.note]), [['a', '12,50', 'x']]);
  const none = P.draftFromShares([], 'THEY_OWE_ME');
  assert.equal(none.strategy, 'equal');
  assert.equal(none.rows.length, 1);
  assert.equal(P.initialDirection(shares), 'THEY_OWE_ME');
  assert.equal(P.initialDirection([shares[1]]), 'I_OWE_THEM');
  assert.equal(P.initialDirection([]), 'THEY_OWE_ME');
});

check('compareWithServer: same division, different part, different rest; draftFromServerPreview adopts the server amounts', () => {
  const d = draft('equal', [row('a'), row('b')]);
  const local = P.computeSharePreview(1000, d);
  const same = P.compareWithServer(local, { shares: [{ personId: 'a', amount: 3.34 }, { personId: 'b', amount: 3.33 }], myPart: 3.33 });
  assert.deepEqual(same, { differences: [], restDiffers: false });
  const other = P.compareWithServer(local, { shares: [{ personId: 'a', amount: 3.33 }, { personId: 'b', amount: 3.33 }], myPart: 3.34 });
  assert.deepEqual(other.differences, [{ personId: 'a', localCents: 334, serverCents: 333 }]);
  assert.equal(other.restDiffers, true);
  const adopted = P.draftFromServerPreview(d, { shares: [{ personId: 'a', amount: 3.33 }, { personId: 'b', amount: 3.34 }], myPart: 3.33 });
  assert.equal(adopted.strategy, 'exact');
  assert.deepEqual(adopted.rows.map((r: Any) => r.amountText), ['3,33', '3,34']);
});

console.log('\n[P4] balances, rows and ledger labels');

check('balanceStatus / balanceSentence: "ela te deve", "você deve", "quite" (cents decide, not floats)', () => {
  assert.deepEqual(P.balanceStatus(10.5), { kind: 'owes-me', label: 'ela te deve', cents: 1050 });
  assert.deepEqual(P.balanceStatus(-3), { kind: 'i-owe', label: 'você deve', cents: 300 });
  assert.deepEqual(P.balanceStatus(0), { kind: 'settled', label: 'quite', cents: 0 });
  assert.equal(P.balanceStatus(0.001).kind, 'settled', 'less than a cent is settled');
  assert.equal(P.balanceSentence('Ana', 10.5), 'Ana te deve R$ 10,50');
  assert.equal(P.balanceSentence('Ana', -3), 'Você deve R$ 3,00 a Ana');
  assert.equal(P.balanceSentence('Ana', 0), 'Quite com Ana');
});

check('summarizeBalances: she owes me / I owe / net, in exact cents', () => {
  const s = P.summarizeBalances([{ balance: 0.1 }, { balance: 0.2 }, { balance: -0.05 }, { balance: 0 }]);
  assert.deepEqual(s, { owedToMeCents: 30, iOweCents: 5, netCents: 25 });
  assert.deepEqual(P.summarizeBalances([]), { owedToMeCents: 0, iOweCents: 0, netCents: 0 });
});

check('mergePeopleRows: balances first, inactive people only on demand, active before inactive, by name', () => {
  const person = (id: string, name: string, isActive = true) => ({ id, householdId: 'h', name, aliases: [], userId: null, isActive });
  const bal = (p: Any, balance: number) => ({ person: p, owedToMe: 0, iOwe: 0, received: 0, paid: 0, balance, openShares: 1 });
  const ana = person('1', 'Ana'); const bia = person('2', 'Bia'); const caio = person('3', 'Caio', false); const dani = person('4', 'Dani', false);
  const balances = [bal(bia, 5), bal(ana, 0), bal(caio, 7)];
  const people = [ana, bia, caio, dani];
  assert.deepEqual(P.mergePeopleRows(balances, people, false).map((r: Any) => r.person.name), ['Ana', 'Bia', 'Caio'], 'an inactive person WITH a balance stays visible');
  assert.deepEqual(P.mergePeopleRows(balances, people, true).map((r: Any) => r.person.name), ['Ana', 'Bia', 'Caio', 'Dani']);
  assert.deepEqual(P.mergePeopleRows([], [ana, caio], false).map((r: Any) => r.person.name), ['Ana']);
  assert.equal(P.mergePeopleRows(balances, people, true).find((r: Any) => r.person.name === 'Dani').balance, null);
});

check('ledger labels follow the direction', () => {
  assert.equal(P.ledgerKindLabel({ kind: 'share', direction: 'THEY_OWE_ME' }), 'Parte dela');
  assert.equal(P.ledgerKindLabel({ kind: 'share', direction: 'I_OWE_THEM' }), 'Sua parte');
  assert.equal(P.ledgerKindLabel({ kind: 'settlement', direction: 'RECEIVED' }), 'Ela te pagou');
  assert.equal(P.ledgerKindLabel({ kind: 'settlement', direction: 'PAID' }), 'Você pagou a ela');
  assert.equal(P.restLabel('THEY_OWE_ME'), 'Sua parte');
});

console.log('\n[P5] settlements');

check('suggestSettlement: the balance is the default amount; the sign decides the direction', () => {
  assert.deepEqual(P.suggestSettlement(25.4), { direction: 'RECEIVED', amountCents: 2540 });
  assert.deepEqual(P.suggestSettlement(-8), { direction: 'PAID', amountCents: 800 });
  assert.deepEqual(P.suggestSettlement(0), { direction: 'RECEIVED', amountCents: 0 });
  assert.equal(P.settlementTransactionType('RECEIVED'), 'INCOME');
  assert.equal(P.settlementTransactionType('PAID'), 'EXPENSE');
});

check('balanceAfterSettlement: RECEIVED lowers what she owes, PAID raises it', () => {
  assert.equal(P.balanceAfterSettlement(2540, 'RECEIVED', 2540), 0);
  assert.equal(P.balanceAfterSettlement(2540, 'RECEIVED', 3000), -460, 'overpaying flips the sign');
  assert.equal(P.balanceAfterSettlement(-800, 'PAID', 800), 0);
});

check('defaultSettlementDraft: amount from the balance, create mode when an account is known', () => {
  const d = P.defaultSettlementDraft({ name: 'Ana' }, 25.4, '2026-10-05', 'acc-1');
  assert.deepEqual(d, {
    direction: 'RECEIVED', amountText: '25,40', date: '2026-10-05', note: '', mode: 'create', accountId: 'acc-1',
    description: 'Acerto recebido de Ana', transactionId: '',
  });
  const zero = P.defaultSettlementDraft({ name: 'Ana' }, 0, '2026-10-05', '');
  assert.equal(zero.amountText, '');
  assert.equal(zero.mode, 'none');
  assert.equal(P.defaultSettlementDraft({ name: 'Ana' }, -3, '2026-10-05', 'a').direction, 'PAID');
});

check('validateSettlement: amount, date, and what the mode needs', () => {
  const base = P.defaultSettlementDraft({ name: 'Ana' }, 10, '2026-10-05', 'acc-1');
  assert.equal(P.validateSettlement(base).ok, true);
  assert.equal(P.validateSettlement({ ...base, amountText: '0' }).errors.amount, 'Informe um valor maior que zero.');
  assert.equal(P.validateSettlement({ ...base, amountText: 'x' }).ok, false);
  assert.equal(P.validateSettlement({ ...base, date: '2026-02-30' }).errors.date, 'Informe uma data válida.');
  assert.equal(P.validateSettlement({ ...base, accountId: '' }).errors.account, 'Escolha a conta.');
  assert.equal(P.validateSettlement({ ...base, mode: 'link' }).errors.transaction, 'Escolha a transação a vincular.');
  assert.equal(P.validateSettlement({ ...base, mode: 'link', transactionId: 't1', accountId: '' }).ok, true, 'no account needed to link');
  assert.equal(P.validateSettlement({ ...base, mode: 'none', accountId: '' }).ok, true);
  assert.equal(P.isValidIsoDate('2026-02-28'), true);
  assert.equal(P.isValidIsoDate('2026-13-01'), false);
  assert.equal(P.isValidIsoDate('05/10/2026'), false);
});

check('buildSettlementInput: only the fields of the chosen mode (create / link / none)', () => {
  const base = { ...P.defaultSettlementDraft({ name: 'Ana' }, 25.4, '2026-10-05', 'acc-1'), note: '  pix  ' };
  assert.deepEqual(P.buildSettlementInput(base, 'h1'), {
    householdId: 'h1', direction: 'RECEIVED', amount: 25.4, date: '2026-10-05', note: 'pix',
    createTransaction: { accountId: 'acc-1', description: 'Acerto recebido de Ana' },
  });
  assert.deepEqual(P.buildSettlementInput({ ...base, mode: 'link', transactionId: 't9', note: '' }, 'h1'), {
    householdId: 'h1', direction: 'RECEIVED', amount: 25.4, date: '2026-10-05', transactionId: 't9',
  });
  assert.deepEqual(P.buildSettlementInput({ ...base, mode: 'none', note: '' }, 'h1'), { householdId: 'h1', direction: 'RECEIVED', amount: 25.4, date: '2026-10-05' });
  assert.deepEqual(P.buildSettlementInput({ ...base, description: '  ' }, 'h1').createTransaction, { accountId: 'acc-1' }, 'blank description: the server default');
  assert.equal(P.buildSettlementInput({ ...base, amountText: '' }, 'h1'), null);
  assert.equal(P.buildSettlementInput({ ...base, direction: 'PAID', amountText: '3,30' }, 'h1').amount, 3.3);
});

check('remembered account: per household, corrupt values replaced, other households kept', () => {
  const raw = P.mergeSavedSettlementAccount(null, 'h1', 'a1');
  assert.equal(P.parseSavedSettlementAccount(raw, 'h1'), 'a1');
  assert.equal(P.parseSavedSettlementAccount(raw, 'h2'), '');
  const both = P.mergeSavedSettlementAccount(raw, 'h2', 'a2');
  assert.equal(P.parseSavedSettlementAccount(both, 'h1'), 'a1');
  assert.equal(P.parseSavedSettlementAccount(both, 'h2'), 'a2');
  assert.equal(P.parseSavedSettlementAccount('{oops', 'h1'), '');
  assert.equal(P.parseSavedSettlementAccount('[1]', 'h1'), '');
  assert.equal(P.parseSavedSettlementAccount(null, 'h1'), '');
  assert.equal(P.parseSavedSettlementAccount(P.mergeSavedSettlementAccount('{oops', 'h1', 'a9'), 'h1'), 'a9');
});

check('settlementAccounts: active, not a credit card', () => {
  const out = P.settlementAccounts([{ id: 1, type: 'CHECKING' }, { id: 2, type: 'CREDIT' }, { id: 3, type: 'SAVINGS', isActive: false }, { id: 4, type: 'CASH', isActive: true }]);
  assert.deepEqual(out.map((a: Any) => a.id), [1, 4]);
});

console.log('\n[P6] person form');

check('aliases: comma/semicolon list, trimmed, deduped like the server, never the name itself', () => {
  assert.deepEqual(P.parseAliasText(' Fofão , Fofinho;; '), ['Fofão', 'Fofinho']);
  assert.deepEqual(P.cleanAliases('Maria', ['Fofão', 'fofao', ' FOFÃO ', 'maria', 'Mari', '']), ['Fofão', 'Mari']);
});

check('validatePersonForm: name required; name or alias of ANOTHER person is a conflict; editing yourself is not', () => {
  const others = [{ id: '1', name: 'Ana', aliases: ['Aninha'] }, { id: '2', name: 'Bia', aliases: [] }];
  assert.deepEqual(P.validatePersonForm('  ', [], others, null), { ok: false, name: 'Informe o nome.' });
  assert.equal(P.validatePersonForm('Caio', ['Cai'], others, null).ok, true);
  assert.match(P.validatePersonForm('ANA', [], others, null).conflict, /"ANA" já é o nome ou apelido de Ana/);
  assert.match(P.validatePersonForm('Caio', ['aninha'], others, null).conflict, /"aninha" já é o nome ou apelido de Ana/);
  assert.equal(P.validatePersonForm('Ana', ['Aninha'], others, '1').ok, true, 'editing Ana keeps her own name and alias');
  assert.match(P.validatePersonForm('Ana', [], others, '2').conflict ?? '', /Ana/, 'but Bia cannot take Ana');
});

check('validatePersonForm: at most 20 aliases and 100 characters (the server caps)', () => {
  const aliases = Array.from({ length: 21 }, (_, i) => `Apelido ${i}`);
  assert.equal(P.validatePersonForm('Caio', aliases.slice(0, 20), [], null).ok, true);
  assert.match(P.validatePersonForm('Caio', aliases, [], null).conflict, /No máximo 20 apelidos\./);
  assert.match(P.validatePersonForm('x'.repeat(101), [], [], null).name, /no máximo 100 caracteres/);
  assert.match(P.validatePersonForm('Caio', ['y'.repeat(101)], [], null).conflict, /apelido pode ter no máximo 100/);
});

check('personSaveFailureMessage: 409 says the name or alias is taken', () => {
  assert.equal(P.personSaveFailureMessage(Object.assign(new Error('x'), { status: 409 })), 'Já existe uma pessoa com este nome ou apelido.');
  assert.equal(P.personSaveFailureMessage(new Error('Falha de rede')), 'Falha de rede');
  assert.equal(P.personSaveFailureMessage(null), 'Não foi possível salvar a pessoa.');
});
