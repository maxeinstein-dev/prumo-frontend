import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P05 L3: barra da renda, moradia e tela de grupos. Lógica pura de utils/incomeSplit.ts. Dados inventados.
// INCOME_SPLIT_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.INCOME_SPLIT_MODULE || frontSrc('utils/incomeSplit.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(modPath).href);

console.log('\n[barra da renda] utils/incomeSplit.ts');

const brl = (cents: number): string => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const group = (o: any = {}): any => ({ id: 'g1', key: 'g1', name: 'Casa', color: '#2457E6', isHousing: true, sortOrder: 0, realized: 0, committed: 0, amount: 0, percentOfIncome: 0, ...o });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const split = (o: any = {}): any => ({
  month: '2026-11',
  income: { amount: 8000, basis: 'expected' },
  groups: [
    group({ amount: 1750, realized: 1500, committed: 250, percentOfIncome: 0.2188 }),
    group({ id: 'g2', key: 'g2', name: 'Pessoal', color: null, isHousing: false, sortOrder: 1, amount: 39.9, committed: 39.9, percentOfIncome: 0.005 }),
    group({ id: 'g3', key: 'g3', name: 'Viagens', color: null, isHousing: false, sortOrder: 2, amount: 0, percentOfIncome: 0 }),
    group({ id: null, key: 'OTHER', name: 'Outros', color: null, isHousing: false, sortOrder: 3, amount: 0, percentOfIncome: 0 }),
  ],
  totalSpent: 1789.9,
  leftover: { amount: 6210.1, percentOfIncome: 0.7763 },
  housing: { amount: 1750, percentOfIncome: 0.2188, reference: 0.3, housingGroups: 1 },
  ...o,
});

// ---- barra --------------------------------------------------------------------------------------------

check('incomeBar: one segment per group with money, then the leftover, widths from the values (not the rounded shares)', () => {
  const bar = S.incomeBar(split());
  assert.deepEqual(bar.segments.map((s: { key: string }) => s.key), ['g1', 'g2', 'leftover']);
  assert.deepEqual(bar.segments.map((s: { cents: number }) => s.cents), [175000, 3990, 621010]);
  const total = bar.segments.reduce((t: number, s: { width: number }) => t + s.width, 0);
  assert.ok(Math.abs(total - 100) < 1e-9, `widths sum ${total}`);
  assert.ok(Math.abs(bar.segments[0].width - 21.875) < 1e-9);
  assert.equal(bar.overCents, 0);
});

check('incomeBar: the shares can miss 100% by rounding; the bar still fills by the values', () => {
  const s = split({ groups: [group({ amount: 33.33, percentOfIncome: 0.3333 }), group({ id: null, key: 'OTHER', name: 'Outros', amount: 33.33, percentOfIncome: 0.3333 })], totalSpent: 66.66, income: { amount: 100, basis: 'expected' }, leftover: { amount: 33.34, percentOfIncome: 0.3334 } });
  const total = S.incomeBar(s).segments.reduce((t: number, x: { width: number }) => t + x.width, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

check('incomeBar: spending above the income has no leftover segment, fills by the spending and reports the excess', () => {
  const s = split({ income: { amount: 1000, basis: 'expected' }, leftover: { amount: -789.9, percentOfIncome: -0.7899 } });
  const bar = S.incomeBar(s);
  assert.equal(bar.segments.some((x: { key: string }) => x.key === 'leftover'), false);
  assert.equal(bar.overCents, 78990);
  const total = bar.segments.reduce((t: number, x: { width: number }) => t + x.width, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

check('incomeBar: no income and no spending gives an empty bar, never NaN widths', () => {
  const s = split({ income: { amount: 0, basis: 'expected' }, groups: [group({ amount: 0, percentOfIncome: null })], totalSpent: 0, leftover: { amount: 0, percentOfIncome: null } });
  const bar = S.incomeBar(s);
  assert.equal(bar.segments.length, 0);
  assert.equal(bar.empty, true);
});

check('incomeBar: a group without colour gets one from the palette; Outros is neutral; leftover is green', () => {
  const bar = S.incomeBar(split({ groups: [...split().groups.slice(0, 3), group({ id: null, key: 'OTHER', name: 'Outros', amount: 10, percentOfIncome: 0.0013 })] }));
  const by = (k: string) => bar.segments.find((x: { key: string }) => x.key === k);
  assert.equal(by('g1').color, '#2457E6');
  assert.match(by('g2').color, /^#|^var\(/);
  assert.notEqual(by('g2').color, by('g1').color);
  assert.equal(by('OTHER').color, S.OTHER_COLOR);
  assert.equal(by('leftover').color, S.LEFTOVER_COLOR);
});

// ---- legenda e percentuais -----------------------------------------------------------------------------

check('shareLabel: whole percent, "<1%" for a sliver, a dash without income', () => {
  assert.equal(S.shareLabel(0.2188), '22%');
  assert.equal(S.shareLabel(0.005), '<1%');
  assert.equal(S.shareLabel(0), '0%');
  assert.equal(S.shareLabel(null), '—');
  assert.equal(S.shareLabel(-0.7899), '-79%');
});

check('incomeLegend: every group of the household (empty ones too), Outros only with money, then the leftover', () => {
  const legend = S.incomeLegend(split(), brl);
  assert.deepEqual(legend.map((l: { label: string }) => l.label), ['Casa', 'Pessoal', 'Viagens', 'Livre da renda']);
  assert.deepEqual(legend[0], { key: 'g1', label: 'Casa', color: '#2457E6', amount: 'R$ 1750,00', share: '22%', committed: 'R$ 250,00 a vencer' });
  assert.equal(legend[2].share, '0%');
  assert.equal(legend[2].committed, null);
  assert.equal(legend[3].amount, 'R$ 6210,10');
});

check('incomeLegend: a negative leftover is called "Falta" with its value', () => {
  const s = split({ income: { amount: 1000, basis: 'expected' }, leftover: { amount: -789.9, percentOfIncome: -0.7899 } });
  const last = S.incomeLegend(s, brl).at(-1);
  assert.equal(last.label, 'Falta');
  assert.equal(last.amount, 'R$ 789,90');
});

check('the card never says "Sobra" (the big number of the Início is the leftover, a cash figure): bar, legend and texts', () => {
  for (const s of [split(), split({ income: { amount: 0, basis: 'expected' } }), split({ income: { amount: 1000, basis: 'expected' }, leftover: { amount: -789.9, percentOfIncome: -0.7899 } })]) {
    const words = JSON.stringify([S.incomeBar(s), S.incomeLegend(s, brl), S.incomeBasisText(s, brl), S.housingCard(s, brl)]);
    assert.doesNotMatch(words, /sobra/i);
  }
  assert.equal(S.incomeBar(split()).segments.at(-1).label, 'Livre da renda');
});

check('incomeBasisText: says the income is the expected one, or that there is none', () => {
  assert.equal(S.incomeBasisText(split(), brl), 'Sobre a renda esperada do mês (R$ 8000,00); compras no cartão contam na data da compra.');
  assert.equal(S.incomeBasisText(split({ income: { amount: 0, basis: 'expected' } }), brl), 'Sem renda esperada para o mês: cadastre o salário ou outra receita mensal em Renda.');
});

// ---- moradia ---------------------------------------------------------------------------------------------

check('housingCard: no housing group is an invitation to mark one, never "0%"', () => {
  const card = S.housingCard(split({ housing: { amount: 0, percentOfIncome: 0, reference: 0.3, housingGroups: 0 } }), brl);
  assert.equal(card.kind, 'invite');
  assert.doesNotMatch(JSON.stringify(card), /0%/);
});

check('housingCard: the share against 30%, within or above', () => {
  const within = S.housingCard(split(), brl);
  assert.equal(within.kind, 'share');
  assert.equal(within.share, '22%');
  assert.equal(within.reference, '30%');
  assert.equal(within.over, false);
  assert.ok(Math.abs(within.fill - 21.88) < 1e-9);
  const above = S.housingCard(split({ housing: { amount: 3000, percentOfIncome: 0.375, reference: 0.3, housingGroups: 1 } }), brl);
  assert.equal(above.over, true);
  assert.equal(above.fill, 37.5);
  const huge = S.housingCard(split({ housing: { amount: 30000, percentOfIncome: 3.75, reference: 0.3, housingGroups: 1 } }), brl);
  assert.equal(huge.fill, 100);
});

check('housingCard: with housing but no income, the value without a share', () => {
  const card = S.housingCard(split({ income: { amount: 0, basis: 'expected' }, housing: { amount: 1750, percentOfIncome: null, reference: 0.3, housingGroups: 1 } }), brl);
  assert.equal(card.kind, 'noIncome');
  assert.equal(card.amount, 'R$ 1750,00');
});

// ---- tela de grupos ----------------------------------------------------------------------------------------

const list = {
  groups: [
    { id: 'g1', name: 'Casa', sortOrder: 0, color: '#2457E6', isHousing: true, categories: [{ categoryName: 'HOUSING', name: 'Moradia', isSystem: true }] },
    { id: 'g2', name: 'Pessoal', sortOrder: 1, color: null, isHousing: false, categories: [{ categoryName: 'HEALTHCARE', name: 'Saúde', isSystem: true }] },
  ],
  ungrouped: [{ categoryName: 'CUSTOM:c1', name: 'Pet', isSystem: false }],
};

check('categoryRows: every expense category with its group, ungrouped ones as Outros (empty value), sorted by name', () => {
  const rows = S.categoryRows(list);
  assert.deepEqual(rows.map((r: { name: string; groupId: string }) => [r.name, r.groupId]), [['Moradia', 'g1'], ['Pet', ''], ['Saúde', 'g2']]);
});

check('groupOptions: the groups in order, then Outros with an empty value', () => {
  assert.deepEqual(S.groupOptions(list), [{ value: 'g1', label: 'Casa' }, { value: 'g2', label: 'Pessoal' }, { value: '', label: 'Outros' }]);
});

check('moveCategory: moves a category between groups and to Outros without touching the others', () => {
  const moved = S.moveCategory(list, 'CUSTOM:c1', 'g1');
  assert.deepEqual(moved.groups[0].categories.map((c: { categoryName: string }) => c.categoryName), ['HOUSING', 'CUSTOM:c1']);
  assert.equal(moved.ungrouped.length, 0);
  const back = S.moveCategory(moved, 'HOUSING', null);
  assert.deepEqual(back.ungrouped.map((c: { categoryName: string }) => c.categoryName), ['HOUSING']);
  assert.equal(list.ungrouped.length, 1, 'the input is not mutated');
  assert.equal(S.moveCategory(list, 'NOPE', 'g1'), list);
});

check('groupNameError: empty, too long, the reserved Outros and a repeated name (case and accents ignored)', () => {
  assert.equal(S.groupNameError('  ', list.groups), 'Dê um nome ao grupo.');
  assert.equal(S.groupNameError('x'.repeat(61), list.groups), 'Use até 60 caracteres.');
  assert.equal(S.groupNameError(' OUTROS ', list.groups), '"Outros" é o grupo das categorias sem grupo.');
  assert.equal(S.groupNameError('casa', list.groups), 'Já existe um grupo com esse nome.');
  assert.equal(S.groupNameError('Casa', list.groups, 'g1'), null);
  assert.equal(S.groupNameError('Viagens', list.groups), null);
});
