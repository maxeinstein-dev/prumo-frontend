import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// ORGANIZE_MODULE points at a mutated copy of utils/organizeShares.ts (bite-checks), next to copies of people.ts and maxfinPayload.ts.
const modPath = process.env.ORGANIZE_MODULE || frontSrc('utils/organizeShares.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const O: any = await import(pathToFileURL(modPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ---- fixtures (invented names and amounts) -------------------------------------------------------------------------

const person = (id: string, name: string, aliases: string[] = [], isActive = true): Any => ({ id, householdId: 'h1', name, aliases, userId: null, isActive });
const ANA = person('p-ana', 'Ana', ['Aninha']);
const BIA = person('p-bia', 'Bia');
const EXISTING = [ANA, BIA];

const proposal = (id: string, tx: string, description: string, txAmount: number, name: string, personId: string | null, amount: number, o: Record<string, unknown> = {}): Any => ({
  id, transactionId: tx, description, date: '2026-10-03', transactionAmount: txAmount, note: `*Dividir com ${name}`, person: { id: personId, name },
  direction: 'THEY_OWE_ME', amount, percent: null, defaultSelected: true, ...o,
});
const review = (tx: string, description: string, txAmount: number, note: string, o: Record<string, unknown> = {}): Any => ({
  transactionId: tx, description, date: '2026-09-12', transactionAmount: txAmount, note, reason: 'texto livre', suggestedPersonId: null, ...o,
});
const settlement = (id: string, tx: string, description: string, amount: number, name: string, personId: string | null, o: Record<string, unknown> = {}): Any => ({
  id, transactionId: tx, description, date: '2026-10-08', amount, person: { id: personId, name }, direction: 'RECEIVED', defaultSelected: true, ...o,
});

function makePreview(o: Record<string, unknown> = {}): Any {
  return {
    proposals: [
      proposal('pr1', 't1', 'Mercado', 100, 'Fofão', null, 50, { percent: 50 }),
      proposal('pr2', 't2', 'Pizza', 80, 'Fofinho', null, 40, { percent: 50 }),
      proposal('pr3', 't3', 'Cinema', 60, 'Ana', 'p-ana', 30, { defaultSelected: false }),
      proposal('pr4', 't4', 'Pagar a Ana', 200, 'Ana', 'p-ana', 200, { direction: 'I_OWE_THEM', note: 'Pagar a Ana' }),
    ],
    review: [
      review('t5', 'Churrasco', 150, 'Dividido com todo mundo'),
      review('t6', 'Padaria', 45.5, 'Divivir com Fofinho'),
      review('t7', 'Uber', 30, '*Ana', { suggestedPersonId: 'p-ana' }),
    ],
    settlements: [
      settlement('st1', 't8', 'Fofinho', 120, 'Fofinho', null),
      settlement('st2', 't9', 'Reembolso - Ana', 55, 'Ana', 'p-ana'),
    ],
    newPeople: [{ name: 'Fofão', aliases: [] }, { name: 'Fofinho', aliases: [] }],
    alreadyDone: 3,
    warnings: [],
    ...o,
  };
}

const APPLIED = { onlyImported: true };
const build = (preview: Any, choices: Any, existing: Any[] = EXISTING): Any => O.buildOrganizeApply('h1', APPLIED, preview, choices, existing);
const registryOf = (preview: Any, choices: Any = O.defaultChoices(preview)): Any[] => O.buildRegistry(preview, choices.review);

console.log('\n[O1] options, default choices, review keys');

check('buildOrganizeOptions: dates optional, validated and ordered; onlyImported always sent', () => {
  assert.deepEqual(O.buildOrganizeOptions('h1', { onlyImported: true, startDate: '', endDate: '' }), { options: { householdId: 'h1', onlyImported: true }, error: null });
  assert.deepEqual(O.buildOrganizeOptions('h1', { onlyImported: false, startDate: '2026-09-01', endDate: '2026-09-30' }).options,
    { householdId: 'h1', onlyImported: false, startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.equal(O.buildOrganizeOptions('h1', { onlyImported: true, startDate: '2026-02-30', endDate: '' }).error, 'A data inicial é inválida.');
  assert.equal(O.buildOrganizeOptions('h1', { onlyImported: true, startDate: '', endDate: 'x' }).error, 'A data final é inválida.');
  assert.equal(O.buildOrganizeOptions('h1', { onlyImported: true, startDate: '2026-10-02', endDate: '2026-10-01' }).error, 'A data inicial é depois da data final.');
  assert.equal(O.buildOrganizeOptions('', { onlyImported: true, startDate: '', endDate: '' }).options, null);
});

check('defaultChoices: proposals and settlements as the server marks them; the review starts unticked', () => {
  const c = O.defaultChoices(makePreview());
  assert.deepEqual(c.proposals, { pr1: true, pr2: true, pr3: false, pr4: true });
  assert.deepEqual(c.settlements, { st1: true, st2: true });
  assert.deepEqual(Object.keys(c.review), ['t5', 't6', 't7']);
  assert.equal(c.review.t5.include, false);
  assert.equal(c.review.t7.personRef, 'p:p-ana', 'a suggested person is preselected but the line stays unticked');
  assert.equal(c.review.t7.include, false);
  assert.equal(c.review.t5.personRef, '');
});

check('reviewKeys: a transaction that comes twice gets #2, #3', () => {
  assert.deepEqual(O.reviewKeys([{ transactionId: 'a' }, { transactionId: 'b' }, { transactionId: 'a' }, { transactionId: 'a' }]), ['a', 'b', 'a#2', 'a#3']);
});

console.log('\n[O2] default apply payload');

check('server defaults: proposalIds and settlementIds as marked, no manual lines, the people that are used', () => {
  const preview = makePreview();
  const out = build(preview, O.defaultChoices(preview));
  assert.deepEqual(out.payload, {
    householdId: 'h1', onlyImported: true, people: [{ name: 'Fofão', aliases: [] }, { name: 'Fofinho', aliases: [] }],
    proposalIds: ['pr1', 'pr2', 'pr4'], settlementIds: ['st1', 'st2'], manual: [],
  });
  assert.equal(out.problem, null);
  assert.deepEqual(out.totals.proposals, { count: 3, theyOweMeCents: 9000, iOweThemCents: 20000, adjusted: 0 });
  assert.deepEqual(out.totals.settlements, { count: 2, receivedCents: 17500, paidCents: 0 });
  assert.equal(out.totals.newPeople, 2);
});

check('the options echoed to the server are the ones of the PREVIEW (dates only when set)', () => {
  const preview = makePreview();
  const c = O.defaultChoices(preview);
  const out = O.buildOrganizeApply('h1', { onlyImported: false, startDate: '2026-09-01', endDate: '2026-10-31' }, preview, c, EXISTING);
  assert.equal(out.payload.onlyImported, false);
  assert.equal(out.payload.startDate, '2026-09-01');
  assert.equal(out.payload.endDate, '2026-10-31');
  assert.equal('startDate' in build(preview, c).payload, false);
});

check('ticking and unticking: setProposal / setSettlement / setAll*', () => {
  const preview = makePreview();
  let c = O.defaultChoices(preview);
  c = O.setProposal(c, 'pr3', true);
  assert.deepEqual(build(preview, c).payload.proposalIds, ['pr1', 'pr2', 'pr3', 'pr4']);
  c = O.setAllProposals(c, preview, false);
  c = O.setAllSettlements(c, preview, false);
  assert.deepEqual(build(preview, c).payload.proposalIds, []);
  assert.deepEqual(build(preview, c).payload.settlementIds, []);
  c = O.setAllSettlements(c, preview, true);
  assert.deepEqual(build(preview, c).payload.settlementIds, ['st1', 'st2']);
  c = O.setSettlement(c, 'st1', false);
  assert.deepEqual(build(preview, c).payload.settlementIds, ['st2']);
});

console.log('\n[O3] people: new, merged ("Fofão" + "Fofinho"), renamed, aliases');

const newPeopleUnticked = (): Any => {
  const preview = makePreview();
  preview.proposals[0].defaultSelected = false;
  preview.proposals[1].defaultSelected = false;
  preview.settlements[0].defaultSelected = false;
  return preview;
};

check('items of new people (person.id null) can arrive unticked: counted, ticked per person, and "marcar todas" does not tick what the server left out for another reason', () => {
  const preview = newPeopleUnticked();
  assert.deepEqual(O.newPersonItemCounts(preview), { proposals: 2, settlements: 1 }, 'what arrived unticked');
  let c = O.defaultChoices(preview);
  assert.deepEqual(c.proposals, { pr1: false, pr2: false, pr3: false, pr4: true });
  assert.deepEqual(O.newPersonItemCounts(preview, c), { proposals: 2, settlements: 1 }, 'what the current choices would leave out');
  assert.deepEqual(O.itemsOfDetected(preview, 'fofinho'), { proposalIds: ['pr2'], settlementIds: ['st1'] });
  assert.deepEqual(O.itemsOfDetected(preview, 'fofao'), { proposalIds: ['pr1'], settlementIds: [] });
  assert.deepEqual(O.itemsOfDetected(preview, 'ana'), { proposalIds: [], settlementIds: [] }, 'a registered person has no "new" items');
  c = O.setDetectedItems(c, preview, 'fofinho', true);
  assert.deepEqual([c.proposals.pr2, c.settlements.st1, c.proposals.pr1], [true, true, false]);
  assert.deepEqual(O.newPersonItemCounts(preview, c), { proposals: 1, settlements: 0 });
  c = O.setDetectedItems(c, preview, 'fofinho', false);
  assert.deepEqual([c.proposals.pr2, c.settlements.st1], [false, false]);
  // bulk: the suggested ones and the new people's; Cinema (Ana, registered, left out by the server) stays out
  c = O.setAllProposals(O.setAllSettlements(O.defaultChoices(preview), preview, true), preview, true);
  assert.deepEqual(c.proposals, { pr1: true, pr2: true, pr3: false, pr4: true });
  assert.deepEqual(c.settlements, { st1: true, st2: true });
  assert.deepEqual(O.newPersonItemCounts(preview, c), { proposals: 0, settlements: 0 });
  // unticking everything is not limited
  c = O.setAllProposals(c, preview, false);
  assert.deepEqual(c.proposals, { pr1: false, pr2: false, pr3: false, pr4: false });
  // the payload follows: only what is ticked, people only for ticked items
  c = O.setDetectedItems(O.defaultChoices(preview), preview, 'fofao', true);
  const out = build(preview, c);
  assert.deepEqual(out.payload.proposalIds, ['pr1', 'pr4']);
  assert.deepEqual(out.payload.people, [{ name: 'Fofão', aliases: [] }]);
});

check('registry: every name without an id, once, with its number of uses', () => {
  const reg = registryOf(makePreview());
  assert.deepEqual(reg.map((d: Any) => [d.key, d.name, d.uses]), [['fofao', 'Fofão', 1], ['fofinho', 'Fofinho', 2]]);
});

check('merge: Fofinho assigned to Fofão -> ONE person with the alias, no entry for Fofinho', () => {
  const preview = makePreview();
  const reg = registryOf(preview);
  const c = O.setAssignment(O.defaultChoices(preview), reg, 'fofinho', 'new:fofao');
  const out = build(preview, c);
  assert.deepEqual(out.payload.people, [{ name: 'Fofão', aliases: ['Fofinho'] }]);
  assert.equal(out.totals.newPeople, 1);
  assert.deepEqual(out.payload.proposalIds, ['pr1', 'pr2', 'pr4'], 'the proposals of Fofinho still go by id');
});

check('merge into a registered person: existingId, her name, the detected names as aliases', () => {
  const preview = makePreview();
  const reg = registryOf(preview);
  let c = O.setAssignment(O.defaultChoices(preview), reg, 'fofao', 'existing:p-bia');
  c = O.setAssignment(c, reg, 'fofinho', 'existing:p-bia');
  const out = build(preview, c);
  assert.deepEqual(out.payload.people, [{ name: 'Bia', aliases: ['Fofão', 'Fofinho'], existingId: 'p-bia' }]);
  assert.equal(out.totals.newPeople, 0);
  assert.equal(out.totals.mergedPeople, 1);
});

check('merge keeps the structure flat: a root that moves takes the names merged into it along', () => {
  const preview = makePreview({ review: [review('t5', 'Churrasco', 150, 'x')] });
  let c = O.defaultChoices(preview);
  c = O.setReview(c, 't5', { personRef: 'new', newName: 'Fofona', include: true, amountText: '10' });
  const reg = registryOf(preview, c);
  assert.deepEqual(reg.map((d: Any) => d.key), ['fofao', 'fofinho', 'fofona']);
  c = O.setAssignment(c, reg, 'fofinho', 'new:fofao');
  const before = c;
  assert.equal(O.setAssignment(c, reg, 'fofona', 'new:fofinho'), before, 'Fofinho is not a root any more: refused');
  assert.equal(O.setAssignment(c, reg, 'fofao', 'new:fofao'), before, 'cannot merge into itself');
  assert.equal(O.setAssignment(c, reg, 'fofao', 'new:nobody'), before, 'unknown target');
  c = O.setAssignment(c, reg, 'fofao', 'existing:p-bia');
  assert.equal(c.assignments.fofinho, 'existing:p-bia', 'Fofinho followed Fofão');
  const t = O.targetOfDetected(reg, c, EXISTING, 'fofinho');
  assert.deepEqual(t, { kind: 'existing', personId: 'p-bia', name: 'Bia' });
  c = O.setAssignment(c, reg, 'fofao', '');
  assert.equal(O.targetOfDetected(reg, c, EXISTING, 'fofao').kind, 'new');
});

check('rename: the final name is the typed one and the detected name stays as an alias (proposals still resolve)', () => {
  const preview = makePreview();
  const c = O.setRename(O.defaultChoices(preview), 'fofao', 'Maria');
  const out = build(preview, c);
  assert.deepEqual(out.payload.people, [{ name: 'Maria', aliases: ['Fofão'] }, { name: 'Fofinho', aliases: [] }]);
});

check('aliases typed by the user: added once (normalized), removable, never the name itself', () => {
  const preview = makePreview();
  let c = O.defaultChoices(preview);
  c = O.addExtraAlias(c, 'new:fofao', 'Fofona');
  c = O.addExtraAlias(c, 'new:fofao', '  FOFONA ');
  c = O.addExtraAlias(c, 'new:fofao', 'fofao');
  c = O.addExtraAlias(c, 'new:fofao', '   ');
  assert.deepEqual(c.extraAliases['new:fofao'], ['Fofona', 'fofao'], 'the repeat (normalized) and the blank are refused; the name itself is dropped later');
  const people = build(preview, c).payload.people;
  assert.deepEqual(people[0], { name: 'Fofão', aliases: ['Fofona'] }, 'the alias equal to the name is dropped when the payload is built');
  c = O.removeExtraAlias(c, 'new:fofao', 'Fofona');
  assert.deepEqual(build(preview, c).payload.people[0], { name: 'Fofão', aliases: [] });
});

check('server-suggested aliases of newPeople go along', () => {
  const preview = makePreview({ newPeople: [{ name: 'Fofão', aliases: ['Amor'] }, { name: 'Fofinho', aliases: [] }] });
  assert.deepEqual(build(preview, O.defaultChoices(preview)).payload.people[0], { name: 'Fofão', aliases: ['Amor'] });
});

check('a new person nothing selected points at is NOT created', () => {
  const preview = makePreview();
  let c = O.defaultChoices(preview);
  c = O.setProposal(c, 'pr1', false);
  assert.deepEqual(build(preview, c).payload.people, [{ name: 'Fofinho', aliases: [] }]);
  c = O.setProposal(c, 'pr2', false);
  c = O.setSettlement(c, 'st1', false);
  assert.deepEqual(build(preview, c).payload.people, []);
});

check('a name that collides with a registered person (name or alias) blocks, naming the person; two new ones with the same name too', () => {
  const preview = makePreview();
  let c = O.setRename(O.defaultChoices(preview), 'fofao', 'ana');
  let out = build(preview, c);
  assert.equal(out.problem.code, 'people-conflict');
  assert.match(out.problem.message, /"ana" já é o nome ou apelido de Ana/);
  c = O.addExtraAlias(O.defaultChoices(preview), 'new:fofao', 'Aninha');
  out = build(preview, c);
  assert.equal(out.problem.code, 'people-conflict');
  assert.match(out.problem.message, /"Aninha" já é o nome ou apelido de Ana/);
  c = O.setRename(O.defaultChoices(preview), 'fofinho', 'FOFAO');
  out = build(preview, c);
  assert.equal(out.problem.code, 'people-conflict');
  assert.match(out.problem.message, /aparece em duas pessoas novas/);
  c = O.setRename(O.defaultChoices(preview), 'fofao', '   ');
  assert.equal(build(preview, c).problem, null, 'a blank rename falls back to the detected name');
});

console.log('\n[O4] review lines resolved by hand');

const withReview = (): { preview: Any; choices: Any } => {
  const preview = makePreview();
  return { preview, choices: O.defaultChoices(preview) };
};

check('percent of the transaction (rounded down) becomes the manual amount; the registered person goes by id', () => {
  const { preview, choices } = withReview();
  let c = O.setReview(choices, 't5', { personRef: 'p:p-bia', mode: 'percent', percentText: '50' });
  assert.equal(c.review.t5.include, true, 'choosing a person ticks the line');
  let out = build(preview, c);
  assert.deepEqual(out.payload.manual, [{ transactionId: 't5', personId: 'p-bia', direction: 'THEY_OWE_ME', amount: 75 }]);
  assert.deepEqual(out.totals.manual, { count: 1, theyOweMeCents: 7500, iOweThemCents: 0 });
  c = O.setReview(choices, 't6', { personRef: 'p:p-bia', mode: 'percent', percentText: '33,33' });
  out = build(preview, c);
  assert.equal(out.payload.manual[0].amount, 15.16, 'floor(4550 * 3333 / 10000) = 1516');
});

check('typed amount, direction I_OWE_THEM, and a person typed on the line (new) goes by name and is created', () => {
  const { preview, choices } = withReview();
  const c = O.setReview(O.setReview(choices, 't6', { personRef: 'new', newName: 'Zeca', mode: 'amount', amountText: '22,75', include: true }), 't6', { direction: 'I_OWE_THEM' });
  const out = build(preview, c);
  assert.deepEqual(out.payload.manual, [{ transactionId: 't6', personName: 'Zeca', direction: 'I_OWE_THEM', amount: 22.75 }]);
  assert.ok(out.payload.people.some((p: Any) => p.name === 'Zeca'), 'Zeca is created');
  assert.equal(out.totals.manual.iOweThemCents, 2275);
});

check('a line pointing at a detected new person follows the merge (Fofinho -> Fofão): personName is the final name', () => {
  const { preview, choices } = withReview();
  let c = O.setReview(choices, 't6', { personRef: 'd:fofinho', mode: 'amount', amountText: '10' });
  c = O.setAssignment(c, registryOf(preview, c), 'fofinho', 'new:fofao');
  const out = build(preview, c);
  assert.deepEqual(out.payload.manual, [{ transactionId: 't6', personName: 'Fofão', direction: 'THEY_OWE_ME', amount: 10 }]);
  c = O.setAssignment(c, registryOf(preview, c), 'fofao', 'existing:p-bia');
  assert.deepEqual(build(preview, c).payload.manual[0], { transactionId: 't6', personId: 'p-bia', direction: 'THEY_OWE_ME', amount: 10 });
});

check('an included line that is incomplete blocks (review-invalid) with the reason on the line; an unticked one never does', () => {
  const { preview, choices } = withReview();
  let c = O.setReview(choices, 't5', { include: true });
  let out = build(preview, c);
  assert.equal(out.problem.code, 'review-invalid');
  assert.match(out.problem.message, /1 linha da revisão marcada está incompleta/);
  assert.equal(out.review[0].error, 'Escolha a pessoa.');
  c = O.setReview(choices, 't5', { personRef: 'p:p-bia' });
  assert.equal(build(preview, c).review[0].error, 'Informe um valor maior que zero.');
  c = O.setReview(c, 't5', { mode: 'percent', percentText: '0' });
  assert.equal(build(preview, c).review[0].error, 'Informe um percentual entre 0,01 e 100.');
  c = O.setReview(c, 't5', { mode: 'amount', amountText: '150,01' });
  assert.equal(build(preview, c).review[0].error, 'O valor passa do valor da transação.');
  c = O.setReview(c, 't5', { personRef: 'new', newName: '', mode: 'amount', amountText: '10' });
  assert.equal(build(preview, c).review[0].error, 'Informe o nome da nova pessoa.');
  c = O.setReview(c, 't5', { include: false });
  out = build(preview, c);
  assert.equal(out.problem, null, 'unticked: never an error');
  assert.equal(out.review[0].error, null);
});

check('setReview: picking nobody unticks the line; an explicit include wins', () => {
  const { choices } = withReview();
  let c = O.setReview(choices, 't5', { personRef: 'p:p-bia' });
  assert.equal(c.review.t5.include, true);
  c = O.setReview(c, 't5', { personRef: '' });
  assert.equal(c.review.t5.include, false);
  c = O.setReview(c, 't5', { personRef: 'p:p-bia', include: false });
  assert.equal(c.review.t5.include, false);
  assert.equal(O.setReview(choices, 'nope', { include: true }), choices, 'unknown key: unchanged');
});

console.log('\n[O5] adjusted proposals and the sum guard');

check('an adjusted proposal leaves proposalIds and goes as manual (the contract has no per-proposal amount)', () => {
  const preview = makePreview();
  const c = O.setProposalAmount(O.defaultChoices(preview), 'pr1', '30,00');
  const out = build(preview, c);
  assert.deepEqual(out.payload.proposalIds, ['pr2', 'pr4']);
  assert.deepEqual(out.payload.manual, [{ transactionId: 't1', personName: 'Fofão', direction: 'THEY_OWE_ME', amount: 30 }]);
  assert.equal(out.totals.proposals.adjusted, 1);
  assert.equal(out.totals.proposals.theyOweMeCents, 3000 + 4000, 'the adjusted amount counts in the totals');
  assert.ok(out.payload.people.some((p: Any) => p.name === 'Fofão'), 'the person is still created');
});

check('typing the server amount is not an adjustment; an adjusted proposal of a registered person goes by id', () => {
  const preview = makePreview();
  let c = O.setProposalAmount(O.defaultChoices(preview), 'pr1', '50');
  assert.deepEqual(build(preview, c).payload.proposalIds, ['pr1', 'pr2', 'pr4']);
  c = O.setProposalAmount(O.setProposal(O.defaultChoices(preview), 'pr3', true), 'pr3', '20');
  assert.deepEqual(build(preview, c).payload.manual, [{ transactionId: 't3', personId: 'p-ana', direction: 'THEY_OWE_ME', amount: 20 }]);
});

check('invalid or too large adjustment blocks (amount-invalid) only while the proposal is ticked', () => {
  const preview = makePreview();
  let c = O.setProposalAmount(O.defaultChoices(preview), 'pr1', 'abc');
  assert.equal(build(preview, c).problem.code, 'amount-invalid');
  c = O.setProposalAmount(O.defaultChoices(preview), 'pr1', '100,01');
  assert.equal(build(preview, c).problem.code, 'amount-invalid');
  assert.match(build(preview, c).proposals[0].error, /passa do valor da transação/);
  c = O.setProposal(c, 'pr1', false);
  assert.equal(build(preview, c).problem, null);
});

check('over-total: shares of the same transaction and direction cannot add up to more than the transaction', () => {
  const preview = makePreview({ review: [review('t1', 'Mercado', 100, 'também com a Bia')] });
  const c = O.setReview(O.defaultChoices(preview), 't1', { personRef: 'p:p-bia', mode: 'amount', amountText: '60' });
  const out = build(preview, c);
  assert.equal(out.problem.code, 'over-total');
  assert.match(out.problem.message, /"Mercado" somam R\$ 110,00, mais que o valor da transação \(R\$ 100,00\)/);
  const ok = O.setReview(c, 't1', { amountText: '50' });
  assert.equal(build(preview, ok).problem, null, 'exactly the total is fine');
  const otherDirection = O.setReview(c, 't1', { direction: 'I_OWE_THEM' });
  assert.equal(build(preview, otherDirection).problem, null, 'the other direction has its own limit');
});

check('nothing selected blocks with none-selected; settlements alone are enough', () => {
  const preview = makePreview();
  let c = O.setAllSettlements(O.setAllProposals(O.defaultChoices(preview), preview, false), preview, false);
  assert.equal(build(preview, c).problem.code, 'none-selected');
  c = O.setSettlement(c, 'st2', true);
  assert.equal(build(preview, c).problem, null);
  assert.deepEqual(build(preview, c).payload.people, [], 'st2 is Ana, who exists');
});

console.log('\n[O6] blocker, refresh, reconcile, texts');

check('organizeBlocker: applying first, then needs-refresh (even with a valid selection), then the choices', () => {
  const preview = makePreview();
  const built = build(preview, O.defaultChoices(preview));
  assert.equal(O.organizeBlocker(built, { needsRefresh: false, applying: false }), null);
  assert.equal(O.organizeBlocker(built, { needsRefresh: true, applying: false }).code, 'needs-refresh');
  assert.equal(O.organizeBlocker(built, { needsRefresh: true, applying: true }).code, 'applying');
  assert.equal(O.organizeBlocker(null, { needsRefresh: false, applying: false }).code, 'none-selected');
  const empty = build(preview, O.setAllSettlements(O.setAllProposals(O.defaultChoices(preview), preview, false), preview, false));
  assert.equal(O.organizeBlocker(empty, { needsRefresh: true, applying: false }).code, 'needs-refresh', 'refresh comes before "nothing selected"');
  assert.match(O.organizeBlocker(built, { needsRefresh: true, applying: false }).message, /Atualize a pré-visualização antes de aplicar de novo/);
});

check('reconcileChoices: what the user decided survives a new preview; what is new gets the server default; what vanished goes', () => {
  const prev = makePreview();
  let c = O.defaultChoices(prev);
  c = O.setProposal(c, 'pr2', false);
  c = O.setProposal(c, 'pr3', true);
  c = O.setProposalAmount(c, 'pr1', '30');
  c = O.setReview(c, 't5', { personRef: 'p:p-bia', mode: 'amount', amountText: '10' });
  c = O.setAssignment(c, registryOf(prev, c), 'fofinho', 'new:fofao');
  c = O.setRename(c, 'fofao', 'Maria');
  c = O.addExtraAlias(c, 'new:fofao', 'Fofona');
  c = O.addExtraAlias(c, 'existing:p-bia', 'Bibi');
  const next = makePreview({
    proposals: [prev.proposals[0], prev.proposals[1], proposal('pr9', 't9x', 'Novo', 10, 'Fofão', null, 5)],
    review: [prev.review[0]],
    settlements: [],
  });
  const r = O.reconcileChoices(prev, c, next, EXISTING);
  assert.deepEqual(r.proposals, { pr1: true, pr2: false, pr9: true }, 'pr2 stays unticked, pr9 is new, pr3/pr4 are gone');
  assert.equal(r.proposalAmounts.pr1, '30');
  assert.equal(r.review.t5.personRef, 'p:p-bia');
  assert.equal(r.review.t5.amountText, '10');
  assert.equal(r.review.t6, undefined);
  assert.deepEqual(r.settlements, {});
  assert.equal(r.assignments.fofinho, 'new:fofao');
  assert.equal(r.renames.fofao, 'Maria');
  assert.deepEqual(r.extraAliases['new:fofao'], ['Fofona']);
  assert.deepEqual(r.extraAliases['existing:p-bia'], ['Bibi']);
  assert.deepEqual(O.reconcileChoices(null, c, next, EXISTING), O.defaultChoices(next), 'no previous preview: plain defaults');
});

check('reconcileChoices drops assignments whose names are gone', () => {
  const prev = makePreview();
  let c = O.setAssignment(O.defaultChoices(prev), registryOf(prev), 'fofinho', 'new:fofao');
  c = O.setAssignment(c, registryOf(prev, c), 'fofao', '');
  const next = makePreview({
    proposals: [prev.proposals[0]], settlements: [], newPeople: [{ name: 'Fofão', aliases: [] }],
  });
  const r = O.reconcileChoices(prev, c, next, EXISTING);
  assert.equal(r.assignments.fofinho, undefined, 'Fofinho no longer appears');
  const gone = O.setAssignment(O.defaultChoices(prev), registryOf(prev), 'fofao', 'existing:p-bia');
  const r2 = O.reconcileChoices(prev, gone, prev, [ANA]);
  assert.equal(r2.assignments.fofao, undefined, 'Bia no longer exists');
});

check('aliases typed for a registered person are checked against the OTHER people (and the server caps of 20 aliases)', () => {
  const preview = makePreview();
  const reg = registryOf(preview);
  let c = O.setAssignment(O.defaultChoices(preview), reg, 'fofao', 'existing:p-bia');
  c = O.addExtraAlias(c, 'existing:p-bia', 'Aninha');
  let out = build(preview, c);
  assert.equal(out.problem.code, 'people-conflict');
  assert.match(out.problem.message, /"Aninha" já é o nome ou apelido de Ana/);
  c = O.removeExtraAlias(c, 'existing:p-bia', 'Aninha');
  c = O.addExtraAlias(c, 'existing:p-bia', 'Bibi');
  assert.equal(build(preview, c).problem, null, 'an alias nobody else has');
  // her own alias is not a conflict
  const bia = person('p-bia', 'Bia', ['Bibi']);
  assert.equal(O.buildOrganizeApply('h1', APPLIED, preview, c, [ANA, bia]).problem, null);
  for (let i = 0; i < 20; i += 1) c = O.addExtraAlias(c, 'existing:p-bia', `Extra ${i}`);
  out = build(preview, c);
  assert.equal(out.problem.code, 'people-conflict');
  assert.match(out.problem.message, /passaria de 20 apelidos/);
});

check('result texts: plurals, zero lines skipped, "Nada foi alterado."', () => {
  const full = { peopleCreated: 1, sharesCreated: 13, settlementsCreated: 2, skipped: 1, warnings: [] };
  assert.deepEqual(O.organizeResultLines(full), [
    '1 pessoa criada.', '13 divisões criadas.', '2 acertos criados.', '1 item ignorado (já feitos ou que já não existem).',
  ]);
  assert.equal(O.organizeSummary({ peopleCreated: 0, sharesCreated: 1, settlementsCreated: 0, skipped: 2, warnings: [] }), '1 divisão criada. 2 itens ignorados (já feitos ou que já não existem).');
  assert.equal(O.organizeSummary({ peopleCreated: 0, sharesCreated: 0, settlementsCreated: 0, skipped: 0, warnings: [] }), 'Nada foi alterado.');
  assert.equal(O.organizeFailureMessage('Falha de rede.'), 'Falha de rede. A organização pode ter sido parcial: atualize a pré-visualização.');
  // The apply is one database transaction: a 4xx means nothing was written; only network/unknown failures may be partial.
  assert.equal(O.organizeFailureMessage('Pessoa repetida', 409), 'Pessoa repetida. Nada foi gravado: atualize a pré-visualização.');
  assert.equal(O.organizeFailureMessage('Inválido.', 400), 'Inválido. Nada foi gravado: atualize a pré-visualização.');
  assert.match(O.organizeFailureMessage('Erro', 500), /parcial/);
  assert.match(O.organizeFailureMessage('Erro', undefined), /parcial/);
});

check('the payload has exactly the contract keys', () => {
  const preview = makePreview();
  const keys = Object.keys(build(preview, O.defaultChoices(preview)).payload).sort();
  assert.deepEqual(keys, ['householdId', 'manual', 'onlyImported', 'people', 'proposalIds', 'settlementIds']);
});
