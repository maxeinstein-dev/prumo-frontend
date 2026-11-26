// Phase 4: scenarios of the REAL "Organizar divisões" wizard (OrganizeSharesDialog) against the fake of people-fake.mjs.
// Registered by people-scenarios.mjs (names P-O*). Every name and amount is invented.
import assert from 'node:assert/strict';

export function registerOrganizeScenarios(H) {
  const { B, w, fake, scenario: ps, flush, all, btn, bodyText, click, typeInto, changeSelect, toggle, pressEscape, byId, labelled, calls, toasts, backdrop, mountWith, newServer, ANA, BIA } = H;

  // ---- fixtures: the same preview the pure tests use (t10_organize.mts), in reais -------------------------------------
  const proposal = (id, tx, description, txAmount, name, personId, amount, o = {}) => ({
    id, transactionId: tx, description, date: '2026-10-03', transactionAmount: txAmount, note: `*Dividir com ${name}`, person: { id: personId, name },
    // The server leaves the items of a person that does not exist yet (id null) unticked: ticking one creates her.
    direction: 'THEY_OWE_ME', amount, percent: null, defaultSelected: personId !== null, ...o,
  });
  const reviewLine = (tx, description, txAmount, note, o = {}) => ({
    transactionId: tx, description, date: '2026-09-12', transactionAmount: txAmount, note, reason: 'texto livre', suggestedPersonId: null, ...o,
  });
  const settlement = (id, tx, description, amount, name, personId, o = {}) => ({
    id, transactionId: tx, description, date: '2026-10-08', amount, person: { id: personId, name }, direction: 'RECEIVED', defaultSelected: personId !== null, ...o,
  });
  const makePreview = (o = {}) => ({
    proposals: [
      proposal('pr1', 't1', 'Mercado', 100, 'Fofão', null, 50, { percent: 50 }),
      proposal('pr2', 't2', 'Pizza', 80, 'Fofinho', null, 40, { percent: 50 }),
      proposal('pr3', 't3', 'Cinema', 60, 'Ana', 'p-ana', 30, { defaultSelected: false }),
      proposal('pr4', 't4', 'Pagar a Ana', 200, 'Ana', 'p-ana', 200, { direction: 'I_OWE_THEM', note: 'Pagar a Ana' }),
    ],
    review: [
      reviewLine('t5', 'Churrasco', 150, 'Dividido com todo mundo'),
      reviewLine('t6', 'Padaria', 45.5, 'Divivir com Fofinho'),
      reviewLine('t7', 'Uber', 30, '*Ana', { suggestedPersonId: 'p-ana' }),
    ],
    settlements: [settlement('st1', 't8', 'Fofinho', 120, 'Fofinho', null), settlement('st2', 't9', 'Reembolso - Ana', 55, 'Ana', 'p-ana')],
    newPeople: [{ name: 'Fofão', aliases: [] }, { name: 'Fofinho', aliases: [] }],
    alreadyDone: 3,
    warnings: [],
    ...o,
  });
  const OK_APPLY = { peopleCreated: 2, sharesCreated: 3, settlementsCreated: 2, skipped: 0, warnings: [] };

  // ---- helpers ---------------------------------------------------------------------------------------------------------
  let open = true;
  const mountOrganize = (server, { preview = makePreview(), result = OK_APPLY, strict = false } = {}) => {
    open = true;
    server.state.organizePreview = typeof preview === 'function' ? preview : () => preview;
    server.state.organizeApply = async () => result;
    return mountWith(server, (cb) => B.createElement(B.OrganizeDialog, { open, onClose: cb.onClose, householdId: 'h1' }), { strict });
  };
  const previewCalls = () => calls('POST', /organize\/preview$/);
  const applyCalls = () => calls('POST', /organize\/apply$/);
  const analyzeBtn = () => btn(/^(Analisar|Analisando…)$/);
  const applyBtn = () => btn(/^(Aplicar|Aplicando…)$/);
  const box = (label) => all('input[type=checkbox]').find((i) => i.getAttribute('aria-label') === label);
  const input = (label) => all('input').find((i) => i.getAttribute('aria-label') === label);
  const select = (label) => all('select').find((s) => s.getAttribute('aria-label') === label);
  const blockerText = () => byId('organize-apply-blocker')?.textContent ?? null;
  const LABEL = {
    pr1: 'Aplicar divisão: Mercado (Fofão)', pr2: 'Aplicar divisão: Pizza (Fofinho)', pr3: 'Aplicar divisão: Cinema (Ana)', pr4: 'Aplicar divisão: Pagar a Ana (Ana)',
    st1: 'Aplicar acerto: Fofinho (Fofinho)', st2: 'Aplicar acerto: Reembolso - Ana (Ana)',
  };
  const ticks = () => Object.fromEntries(Object.entries(LABEL).map(([k, label]) => [k, box(label)?.checked ?? null]));
  /** Opens the preview. By default the items of new people are ticked in bulk (the old server defaults); `raw` keeps what arrived. */
  async function toPreview(server, o = {}) {
    await mountOrganize(server, o);
    await click(analyzeBtn());
    await flush(30);
    assert.ok(applyBtn(), 'the preview step shows Aplicar');
    if (!o.raw) {
      if (btn(/^Marcar todas$/)) await click(btn(/^Marcar todas$/));
      if (btn(/^Marcar todos$/)) await click(btn(/^Marcar todos$/));
    }
  }
  const lastApply = () => applyCalls().at(-1)?.payload;

  // ---- scenarios -------------------------------------------------------------------------------------------------------

  ps('P-O1 options step: nothing is requested until "Analisar"; the preview request carries the options; the server marks are the defaults', async () => {
    const server = newServer();
    await mountOrganize(server);
    assert.equal(previewCalls().length, 0);
    assert.ok(byId('organize-only-imported').checked, 'only the importer lines by default');
    await click(analyzeBtn());
    await flush(30);
    assert.deepEqual(previewCalls().map((c) => c.payload), [{ householdId: 'h1', onlyImported: true }]);
    assert.deepEqual(ticks(), { pr1: false, pr2: false, pr3: false, pr4: true, st1: false, st2: true }, 'new people arrive unticked');
    for (const t of ['Churrasco', 'Padaria', 'Uber']) assert.equal(box(`Incluir linha: ${t}`).checked, false, `${t} starts unticked`);
    assert.equal(select('Pessoa da linha: Uber').value, 'p:p-ana', 'a suggested person is preselected');
    assert.match(bodyText(), /3 divisões já estavam feitas\. Só lançamentos do importador\./);
    await click(btn(/^Marcar todas$/));
    await click(btn(/^Marcar todos$/));
    assert.match(bodyText(), /3 divisões \(ela te deve R\$ 90\.00, você deve R\$ 200\.00\) · 2 acertos \(recebido R\$ 175\.00\) · 2 pessoas novas/);
  });

  ps('P-O2 dates and "only imported" travel in the preview and are echoed by the apply; invalid dates stop before any request', async () => {
    const server = newServer();
    await mountOrganize(server);
    await typeInto(byId('organize-start'), '2026-10-31');
    await typeInto(byId('organize-end'), '2026-10-01');
    await click(analyzeBtn());
    assert.match(bodyText(), /A data inicial é depois da data final\./);
    assert.equal(previewCalls().length, 0);
    await typeInto(byId('organize-start'), '2026-10-01');
    await typeInto(byId('organize-end'), '2026-10-31');
    await toggle(byId('organize-only-imported'));
    await click(analyzeBtn());
    await flush(30);
    assert.deepEqual(previewCalls()[0].payload, { householdId: 'h1', onlyImported: false, startDate: '2026-10-01', endDate: '2026-10-31' });
    assert.match(bodyText(), /Todos os lançamentos, de 01\/10\/2026 até 31\/10\/2026\./);
    await click(applyBtn());
    await flush(30);
    assert.equal(lastApply().onlyImported, false);
    assert.equal(lastApply().startDate, '2026-10-01');
    assert.equal(lastApply().endDate, '2026-10-31');
  });

  ps('P-O3 apply with the defaults: one request with the marked ids and the people that are used; then the result summary', async () => {
    const server = newServer();
    await toPreview(server);
    await click(applyBtn());
    await flush(30);
    assert.equal(applyCalls().length, 1);
    assert.deepEqual(lastApply(), {
      householdId: 'h1', onlyImported: true, people: [{ name: 'Fofão', aliases: [] }, { name: 'Fofinho', aliases: [] }],
      proposalIds: ['pr1', 'pr2', 'pr4'], settlementIds: ['st1', 'st2'], manual: [],
    });
    assert.match(bodyText(), /Organização concluída/);
    assert.match(bodyText(), /2 pessoas criadas\./);
    assert.match(bodyText(), /3 divisões criadas\./);
    assert.match(bodyText(), /2 acertos criados\./);
    assert.deepEqual(toasts().at(-1), ['success', '2 pessoas criadas. 3 divisões criadas. 2 acertos criados.']);
    await click(btn(/^Fechar$/));
    assert.equal(H.current.counters.closed, 1);
  });

  ps('P-O4 "Fofão" and "Fofinho" are the same person: one new person with the other name and a typed alias', async () => {
    const server = newServer();
    await toPreview(server);
    const who = select('Quem é Fofinho');
    assert.deepEqual([...who.options].map((o) => o.value), ['', 'new:fofao', 'existing:p-ana', 'existing:p-bia', 'existing:p-caio']);
    await changeSelect(who, 'new:fofao');
    assert.match(bodyText(), /Junta com Fofão/);
    assert.match(bodyText(), /Fofão \+ Fofinho/);
    assert.ok(!select('Quem é Fofão').querySelector('option[value="new:fofinho"]'), 'only a root can receive merges');
    await typeInto(byId('alias-new:fofao'), 'Fofona');
    await click(btn(/^Adicionar$/));
    assert.ok(labelled(/^Remover o apelido Fofona$/), 'a typed alias can be removed');
    assert.ok(!labelled(/^Remover o apelido Fofinho$/), 'a detected name cannot');
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().people, [{ name: 'Fofão', aliases: ['Fofinho', 'Fofona'] }]);
    assert.deepEqual(lastApply().proposalIds, ['pr1', 'pr2', 'pr4'], 'proposals still go by id');
    assert.deepEqual(lastApply().settlementIds, ['st1', 'st2']);
  });

  ps('P-O5 merge into a registered person: existingId, her name, the detected names as aliases', async () => {
    const server = newServer();
    await toPreview(server);
    await changeSelect(select('Quem é Fofão'), 'existing:p-bia');
    await changeSelect(select('Quem é Fofinho'), 'existing:p-bia');
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().people, [{ name: 'Bia', aliases: ['Fofão', 'Fofinho'], existingId: 'p-bia' }]);
  });

  ps('P-O6 rename a new person: the detected name stays as an alias so its proposals still resolve', async () => {
    const server = newServer();
    await toPreview(server);
    await typeInto(byId('rename-new:fofao'), 'Maria');
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().people, [{ name: 'Maria', aliases: ['Fofão'] }, { name: 'Fofinho', aliases: [] }]);
  });

  ps('P-O7 a name taken by a registered person blocks the apply and says who', async () => {
    const server = newServer();
    await toPreview(server);
    await typeInto(byId('rename-new:fofao'), 'ana');
    assert.ok(applyBtn().disabled);
    assert.match(blockerText(), /"ana" já é o nome ou apelido de Ana: junte com essa pessoa/);
    await click(applyBtn());
    assert.equal(applyCalls().length, 0);
    await typeInto(byId('rename-new:fofao'), 'Maria');
    assert.ok(!applyBtn().disabled);
    assert.equal(blockerText(), null);
  });

  ps('P-O8 review lines: person + percent become a manual entry with the amount; unticking drops it', async () => {
    const server = newServer();
    await toPreview(server);
    await changeSelect(select('Pessoa da linha: Churrasco'), 'p:p-bia');
    assert.ok(box('Incluir linha: Churrasco').checked, 'choosing a person ticks the line');
    await changeSelect(select('Valor ou percentual: Churrasco'), 'percent');
    await typeInto(input('Percentual da linha: Churrasco'), '50');
    assert.match(bodyText(), /= R\$ 75\.00/);
    await changeSelect(select('Sentido da linha: Padaria'), 'I_OWE_THEM');
    await changeSelect(select('Pessoa da linha: Padaria'), 'new');
    await typeInto(input('Nome da nova pessoa: Padaria'), 'Zeca');
    await typeInto(input('Valor da linha: Padaria'), '22,75');
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().manual, [
      { transactionId: 't5', personId: 'p-bia', direction: 'THEY_OWE_ME', amount: 75 },
      { transactionId: 't6', personName: 'Zeca', direction: 'I_OWE_THEM', amount: 22.75 },
    ]);
    assert.ok(lastApply().people.some((p) => p.name === 'Zeca'), 'the person typed on a line is created');
  });

  ps('P-O9 a ticked review line that is incomplete blocks with the reason; ticking it off lets the apply through', async () => {
    const server = newServer();
    await toPreview(server);
    await toggle(box('Incluir linha: Churrasco'));
    assert.ok(applyBtn().disabled);
    assert.match(blockerText(), /1 linha da revisão marcada está incompleta: complete ou desmarque\./);
    assert.match(bodyText(), /Escolha a pessoa\./);
    await click(applyBtn());
    assert.equal(applyCalls().length, 0);
    await changeSelect(select('Pessoa da linha: Churrasco'), 'p:p-bia');
    assert.match(bodyText(), /Informe um valor maior que zero\./);
    await typeInto(input('Valor da linha: Churrasco'), '150,01');
    assert.match(bodyText(), /O valor passa do valor da transação\./);
    await toggle(box('Incluir linha: Churrasco'));
    assert.ok(!applyBtn().disabled);
  });

  ps('P-O10 "Ajustar": a proposal with its own amount leaves proposalIds and goes as manual', async () => {
    const server = newServer();
    await toPreview(server);
    await typeInto(input('Ajustar o valor: Mercado (Fofão)'), '30,00');
    assert.match(bodyText(), /era R\$ 50\.00/);
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().proposalIds, ['pr2', 'pr4']);
    assert.deepEqual(lastApply().manual, [{ transactionId: 't1', personName: 'Fofão', direction: 'THEY_OWE_ME', amount: 30 }]);
    assert.ok(lastApply().people.some((p) => p.name === 'Fofão'));
  });

  ps('P-O11 a bad adjustment blocks while ticked; the sum of the shares of a transaction cannot pass the transaction', async () => {
    const server = newServer();
    await toPreview(server, { preview: makePreview({ review: [reviewLine('t1', 'Mercado', 100, 'também com a Bia')] }) });
    await typeInto(input('Ajustar o valor: Mercado (Fofão)'), 'abc');
    assert.match(blockerText(), /1 valor ajustado é inválido/);
    await typeInto(input('Ajustar o valor: Mercado (Fofão)'), '');
    await changeSelect(select('Pessoa da linha: Mercado'), 'p:p-bia');
    await typeInto(input('Valor da linha: Mercado'), '60');
    assert.match(blockerText(), /"Mercado" somam R\$ 110,00, mais que o valor da transação \(R\$ 100,00\)/);
    assert.ok(applyBtn().disabled);
    await typeInto(input('Valor da linha: Mercado'), '50');
    assert.equal(blockerText(), null);
  });

  ps('P-O12 nothing marked: the apply is blocked with the reason', async () => {
    const server = newServer();
    await toPreview(server);
    await click(btn(/^Desmarcar todas$/));
    await click(btn(/^Desmarcar todos$/));
    assert.deepEqual(ticks(), { pr1: false, pr2: false, pr3: false, pr4: false, st1: false, st2: false });
    assert.ok(applyBtn().disabled);
    assert.equal(blockerText(), 'Marque ao menos uma divisão, linha da revisão ou acerto.');
    await click(btn(/^Marcar todos$/));
    assert.ok(!applyBtn().disabled, 'settlements alone are enough');
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().proposalIds, []);
    assert.deepEqual(lastApply().settlementIds, ['st1', 'st2']);
    assert.deepEqual(lastApply().people.map((p) => p.name), ['Fofinho'], 'only the person a marked item points at');
  });

  ps('P-O13 a failed apply blocks until the preview is refreshed; the choices survive the refresh', async () => {
    const server = newServer();
    await toPreview(server);
    await toggle(box(LABEL.pr2));
    server.state.organizeApply = async () => { throw Object.assign(new Error('Falha de rede'), { status: 500 }); };
    await click(applyBtn());
    await flush(30);
    assert.equal(applyCalls().length, 1);
    assert.match(bodyText(), /Falha de rede\. A organização pode ter sido parcial: atualize a pré-visualização\./);
    assert.deepEqual(toasts().at(-1), ['error', 'Falha de rede. A organização pode ter sido parcial: atualize a pré-visualização.']);
    assert.ok(applyBtn().disabled, 'blocked');
    assert.equal(blockerText(), 'Atualize a pré-visualização antes de aplicar de novo.');
    await click(applyBtn());
    await pressEnter(applyBtn());
    assert.equal(applyCalls().length, 1, 'no second request from the stale preview');
    // the failed apply did write pr1: it is gone from the new preview
    server.state.organizePreview = () => makePreview({ proposals: makePreview().proposals.filter((p) => p.id !== 'pr1'), alreadyDone: 4 });
    server.state.organizeApply = async () => OK_APPLY;
    await click(btn(/^Atualizar pré-visualização$/));
    await flush(30);
    assert.equal(previewCalls().length, 2);
    assert.deepEqual(previewCalls()[1].payload, previewCalls()[0].payload, 'the same options as the preview it refreshes');
    assert.ok(!applyBtn().disabled, 'unblocked');
    assert.equal(box(LABEL.pr1), undefined, 'pr1 is gone');
    assert.equal(box(LABEL.pr2).checked, false, 'what the user unticked stays unticked');
    assert.match(bodyText(), /4 divisões já estavam feitas/);
    await click(applyBtn());
    await flush(30);
    assert.equal(applyCalls().length, 2);
    assert.deepEqual(lastApply().proposalIds, ['pr4']);
  });
  async function pressEnter(el) {
    await B.act(async () => {
      el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      el.dispatchEvent(new w.KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    });
    await flush(10);
  }

  ps('P-O14 no closing while applying (ESC, backdrop, X); Aplicar and Voltar are disabled; one request', async () => {
    const server = newServer();
    await toPreview(server);
    const gate = server.gate((m, u) => m === 'POST' && /organize\/apply$/.test(u));
    await click(applyBtn());
    await flush(5);
    assert.ok(btn(/^Aplicando…$/).disabled);
    assert.ok(btn(/^Voltar$/).disabled);
    await pressEscape();
    await click(backdrop());
    await click(btn(/^Fechar modal$/));
    assert.ok(btn(/^Fechar modal$/).disabled);
    await click(btn(/^Aplicando…$/));
    assert.equal(H.current.counters.closed, 0);
    assert.equal(applyCalls().length, 1);
    gate.ok();
    await flush(30);
    assert.match(bodyText(), /Organização concluída/);
    assert.equal(H.current.counters.closed, 0);
  });

  ps('P-O15 latest wins across a close: a preview answering after the dialog was closed and reopened never shows up', async () => {
    const server = newServer();
    await mountOrganize(server);
    const gate = server.gate((m, u) => m === 'POST' && /organize\/preview$/.test(u));
    await click(analyzeBtn());
    await flush(5);
    assert.ok(btn(/^Analisando…$/).disabled);
    open = false;
    await H.current.rerender();
    open = true;
    await H.current.rerender();
    gate.ok();
    await flush(40);
    assert.ok(!applyBtn(), 'no preview step: the late answer was dropped');
    assert.ok(btn(/^Analisar$/), 'back on the options step');
  });

  ps('P-O16 a preview error is a toast; the options step stays usable', async () => {
    const server = newServer();
    await mountOrganize(server);
    server.state.organizePreview = () => { throw Object.assign(new Error('Servidor indisponível'), { status: 503 }); };
    await click(analyzeBtn());
    await flush(30);
    assert.deepEqual(toasts().at(-1), ['error', 'Servidor indisponível']);
    assert.ok(btn(/^Analisar$/) && !btn(/^Analisar$/).disabled);
    assert.ok(!applyBtn());
  });

  ps('P-O17 "Voltar" returns to the options; new options start from the server defaults again', async () => {
    const server = newServer();
    await toPreview(server);
    assert.equal(box(LABEL.pr1).checked, true, 'ticked in bulk by the helper');
    await toggle(box(LABEL.pr4));
    await click(btn(/^Voltar$/));
    assert.ok(byId('organize-only-imported'));
    await click(analyzeBtn());
    await flush(30);
    assert.equal(box(LABEL.pr4).checked, true, 'a different run is not the same decision: the server default again');
    assert.equal(box(LABEL.pr1).checked, false, 'and the new person arrives unticked again');
    assert.equal(previewCalls().length, 2);
  });

  ps('P-O18 warnings, an empty preview and the warnings of the result are shown', async () => {
    const server = newServer();
    await toPreview(server, {
      preview: makePreview({ proposals: [], review: [], settlements: [], newPeople: [], alreadyDone: 0, warnings: ['2 notas sem pessoa reconhecida'] }),
      result: { peopleCreated: 0, sharesCreated: 0, settlementsCreated: 0, skipped: 2, warnings: ['Divisão já existente ignorada'] },
    });
    assert.match(bodyText(), /2 notas sem pessoa reconhecida/);
    assert.match(bodyText(), /Nada para organizar/);
    assert.ok(applyBtn().disabled);
    await unmountAndRemountWithWork();
  });
  async function unmountAndRemountWithWork() {
    await H.unmount();
    const server = newServer();
    await toPreview(server, { result: { peopleCreated: 0, sharesCreated: 0, settlementsCreated: 0, skipped: 2, warnings: ['Divisão já existente ignorada'] } });
    await click(applyBtn());
    await flush(30);
    assert.match(bodyText(), /2 itens ignorados \(já feitos ou que já não existem\)\./);
    assert.match(bodyText(), /Divisão já existente ignorada/);
    assert.deepEqual(toasts().at(-1), ['success', '2 itens ignorados (já feitos ou que já não existem).']);
  }

  ps('P-O19 StrictMode: one preview, one apply', async () => {
    const server = newServer();
    await toPreview(server, { strict: true });
    assert.equal(previewCalls().length, 1);
    await click(applyBtn());
    await flush(30);
    assert.equal(applyCalls().length, 1);
  });

  ps('P-O20 the people list for merging offers active people only, and a person typed on a line follows a later merge', async () => {
    const server = newServer({ people: [ANA, BIA, { id: 'p-old', householdId: 'h1', name: 'Dora', aliases: [], userId: null, isActive: false }] });
    await toPreview(server);
    assert.ok(![...select('Quem é Fofão').options].some((o) => o.value === 'existing:p-old'), 'inactive people are not merge targets');
    await changeSelect(select('Pessoa da linha: Padaria'), 'd:fofinho');
    await typeInto(input('Valor da linha: Padaria'), '10');
    await changeSelect(select('Quem é Fofinho'), 'new:fofao');
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().manual, [{ transactionId: 't6', personName: 'Fofão', direction: 'THEY_OWE_ME', amount: 10 }]);
    assert.deepEqual(lastApply().people, [{ name: 'Fofão', aliases: ['Fofinho'] }]);
  });

  ps('P-R8 a double click on "Aplicar" sends one apply request', async () => {
    const server = newServer();
    await toPreview(server);
    server.gate((m, u) => m === 'POST' && /organize\/apply$/.test(u));
    await B.act(async () => {
      const el = applyBtn();
      el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await flush(30);
    assert.equal(applyCalls().length, 1);
  });

  ps('P-R14 a refused apply (4xx) says nothing was written; a network failure says it may be partial; both block until refreshed', async () => {
    const server = newServer();
    await toPreview(server);
    server.state.organizeApply = async () => { throw Object.assign(new Error('Pessoa repetida'), { status: 409 }); };
    await click(applyBtn());
    await flush(30);
    assert.match(bodyText(), /Pessoa repetida\. Nada foi gravado: atualize a pré-visualização\./);
    assert.doesNotMatch(bodyText(), /parcial/);
    assert.ok(applyBtn().disabled);
    await H.unmount();
    await toPreview(server);
    server.state.organizeApply = async () => { throw new Error('Network error: Unable to connect to server'); };
    await click(applyBtn());
    await flush(30);
    assert.match(bodyText(), /A organização pode ter sido parcial: atualize a pré-visualização\./);
    assert.ok(applyBtn().disabled);
  });

  ps('P-R15 aliases typed for a registered person are checked against the other people', async () => {
    const server = newServer();
    await toPreview(server);
    await changeSelect(select('Quem é Fofão'), 'existing:p-bia');
    await typeInto(byId('alias-existing:p-bia'), 'Aninha');
    await click(btn(/^Adicionar$/));
    assert.match(blockerText(), /"Aninha" já é o nome ou apelido de Ana/);
    assert.ok(applyBtn().disabled);
    await click(labelled(/^Remover o apelido Aninha$/));
    assert.equal(blockerText(), null);
  });

  ps('P-O21 items of new people arrive unticked: the notice, "marcar todas de X", the bulk ticks, and what is left out before the button', async () => {
    const server = newServer();
    const pv = makePreview();
    pv.review[0].reason = 'Coletivo: nao e uma pessoa';
    await toPreview(server, { preview: pv, raw: true });
    assert.deepEqual(ticks(), { pr1: false, pr2: false, pr3: false, pr4: true, st1: false, st2: true });
    assert.equal(byId('organize-new-people-note').textContent, '2 divisões e 1 acerto de pessoas novas vêm desmarcados: marque para criar a pessoa.');
    assert.equal(byId('organize-left-out').textContent, '3 itens de pessoas novas ficam de fora.', 'said before the button');
    assert.match(bodyText(), /Coletivo: nao e uma pessoa/, 'the reason of a review line is visible');
    assert.match(bodyText(), /as de pessoas novas vêm desmarcadas, porque marcar uma cria a pessoa/);
    // per person: Fofão has the proposal pr1; Fofinho has pr2 and the settlement st1
    await click(labelled(/^Marcar todas de Fofão$/));
    assert.deepEqual(ticks(), { pr1: true, pr2: false, pr3: false, pr4: true, st1: false, st2: true });
    assert.equal(byId('organize-left-out').textContent, '2 itens de pessoas novas ficam de fora.');
    assert.ok(labelled(/^Desmarcar todas de Fofão$/), 'the control flips once all of them are ticked');
    await click(labelled(/^Marcar todas de Fofinho$/));
    assert.deepEqual(ticks(), { pr1: true, pr2: true, pr3: false, pr4: true, st1: true, st2: true });
    assert.equal(byId('organize-left-out'), null, 'nothing of a new person is left out');
    await click(labelled(/^Desmarcar todas de Fofinho$/));
    assert.deepEqual(ticks(), { pr1: true, pr2: false, pr3: false, pr4: true, st1: false, st2: true });
    // bulk: the new-person items and the suggested ones, NOT the registered person's one the server left out (Cinema)
    await click(btn(/^Marcar todas$/));
    await click(btn(/^Marcar todos$/));
    assert.deepEqual(ticks(), { pr1: true, pr2: true, pr3: false, pr4: true, st1: true, st2: true }, 'Cinema (Ana, registered) stays as the server left it');
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().proposalIds, ['pr1', 'pr2', 'pr4']);
    assert.deepEqual(lastApply().settlementIds, ['st1', 'st2']);
    assert.deepEqual(lastApply().people.map((p) => p.name), ['Fofão', 'Fofinho']);
  });

  ps('P-O22 applying with new-person items still unticked: the left-out line is there and the payload really leaves them out', async () => {
    const server = newServer();
    await toPreview(server, { raw: true });
    await click(labelled(/^Marcar todas de Fofão$/));
    assert.equal(byId('organize-left-out').textContent, '2 itens de pessoas novas ficam de fora.');
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().proposalIds, ['pr1', 'pr4']);
    assert.deepEqual(lastApply().settlementIds, ['st2']);
    assert.deepEqual(lastApply().people, [{ name: 'Fofão', aliases: [] }], 'only the person something ticked points at');
  });
}
