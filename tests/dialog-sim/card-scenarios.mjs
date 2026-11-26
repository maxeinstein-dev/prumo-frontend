// Phase 3 (card invoice .ofx): scenarios of the REAL ImportCardOfxDialog and of the hand-off from the generic
// ImportTransactionsDialog, against the fake server of stubs/api.ts (kinds 'card-preview', 'card-confirm',
// 'statement-preview'). Registered by scenarios.mjs; every fixture is invented.
import assert from 'node:assert/strict';

export function registerCardScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click }) {
  // ---- fixtures ---------------------------------------------------------------------------------------------
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const monthKey = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;
  const optionsOf = (body) => { const raw = body.get('options'); return raw ? JSON.parse(raw) : null; };

  /**
   * One invoice with every kind of proposal. `applied` (group ids) simulates a confirm that already went through
   * for those groups: their lines come back reconciled and the proposals are gone.
   */
  function makeCard({ createsDefault = true, paymentProposal = 'adjust', warnings = [] } = {}) {
    let k = 0;
    const L = (memo, amount, o = {}) => {
      k += 1;
      return {
        ref: `ofx:K${k}:${String(k).padStart(8, '0')}`, fitid: `K${k}`, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo,
        merchant: memo.replace(/ - Parcela \d+\/\d+$/, ''), installment: null, status: 'proposed', group: null, ...o,
      };
    };
    const T = (id, description, amount, o = {}) => ({ transactionId: id, description, amount, type: 'EXPENSE', date: '2026-09-08', sourceRef: `maxfin:2026-10:credit:${id}`, ...o });
    const P = (group, kind, lines, o = {}) => {
      for (const l of lines) l.group = group;
      return { group, kind, refs: lines.map((l) => l.ref), defaultSelected: true, ambiguous: false, target: null, result: null, futureInstallments: 0, ...o };
    };
    const named = {
      padaria: L('Padaria Sol Nascente', 25.9, { date: '2026-09-03' }),
      cursoA: L('Curso Alfa - Parcela 4/10', 100, { installment: { number: 4, total: 10 } }),
      cursoB: L('Curso Alfa - Parcela 5/10', 100, { installment: { number: 5, total: 10 } }),
      cursoDesc: L('Desconto Antecipação Curso Alfa', 12.34, { type: 'INCOME', kind: 'discount' }),
      posto1: L('Posto Via Norte', 120),
      posto2: L('Posto Via Norte', 80),
      lojaBeta: L('Loja Beta - Parcela 3/6', 50, { installment: { number: 3, total: 6 } }),
      livraria: L('Livraria Gama', 45.5),
      eletro: L('Eletro Delta - Parcela 1/3', 300, { installment: { number: 1, total: 3 } }),
      siteBuy: L('Site Omega', 199.99),
      siteRefund: L('Site Omega', 199.99, { type: 'INCOME', kind: 'refund' }),
      mercado: L('Mercado Zeta', 60, { status: 'reconciled' }),
      pagamento: L('Pagamento recebido', 900, { type: 'INCOME', kind: 'payment', status: 'payment', date: '2026-09-09' }),
      antecipado: L('Pagamento recebido', 150, { type: 'INCOME', kind: 'payment', status: 'payment', date: '2026-09-20' }),
      antecipadoPar: L('Pagamento recebido', 70, { type: 'INCOME', kind: 'payment', date: '2026-09-25' }),
      farm1: L('Farmacia Kappa', 30),
      farm2: L('Farmacia Kappa', 20),
    };
    const n = named;
    const proposals = [
      P('g-exact', 'enrich-exact', [n.padaria], { target: T('t-padaria', 'Padaria', 25.9), result: { date: '2026-09-03', description: 'Padaria Sol Nascente', notesAppend: 'Planilha: Padaria' } }),
      P('g-plan', 'enrich-plan', [n.cursoA, n.cursoB, n.cursoDesc], {
        target: T('t-curso', 'Curso Alfa 4/10 +1', 187.66),
        result: { date: '2026-09-10', description: 'Curso Alfa 4/10 +1', notesAppend: 'OFX: Curso Alfa - Parcela 4/10; Curso Alfa - Parcela 5/10; Desconto Antecipação Curso Alfa' },
      }),
      P('g-sum', 'enrich-sum', [n.posto1, n.posto2], { target: T('t-gasolina', 'Gasolina 200', 200), result: { date: '2026-09-10', description: 'Gasolina 200', notesAppend: 'OFX: 2 linhas' } }),
      P('g-paid', 'enrich-exact', [n.antecipadoPar], {
        target: T('t-antecipado', 'Pagamento antecipado', 70, { type: 'INCOME' }),
        result: { date: '2026-09-25', description: 'Pagamento recebido', notesAppend: 'Planilha: Pagamento antecipado' },
      }),
      P('g-amb', 'enrich-sum', [n.farm1, n.farm2], { defaultSelected: false, ambiguous: true, target: T('t-farmacia', 'Farmácia 50', 50), result: { date: '2026-09-10', description: 'Farmácia 50', notesAppend: null } }),
      P('g-future', 'consume-future', [n.lojaBeta], { target: T('t-beta3', 'Loja Beta 3/6', 50, { date: '2026-10-01' }), result: { date: '2026-09-10', description: 'Loja Beta - Parcela 3/6', notesAppend: null } }),
      P('g-livraria', 'create', [n.livraria], { defaultSelected: createsDefault }),
      P('g-eletro', 'create', [n.eletro], { defaultSelected: createsDefault, futureInstallments: 2 }),
      P('g-rev', 'reversal', [n.siteBuy, n.siteRefund], { defaultSelected: false }),
    ];
    const lines = Object.values(named);
    const payment = paymentProposal
      ? {
          ref: n.pagamento.ref, amount: 900, date: '2026-09-09', invoiceMonthKey: '2026-09', proposal: paymentProposal,
          recorded: paymentProposal === 'create' ? null : { transactionId: 't-pay-09', amount: 905, date: '2026-09-10', sourceAccountId: 'acc-main' },
        }
      : null;
    const card = {
      named,
      applied: new Set(),
      build(opts) {
        const applied = card.applied;
        const out = clone({
          accountId: 'acc-card', householdId: 'h1', month: { year: 2026, month: 10 }, monthKey: '2026-10', monthSource: 'statement',
          period: { start: '2026-09-02', end: '2026-10-02' }, ofxTotal: 919.06,
          lines: lines.map((l) => (applied.has(l.group) ? { ...l, status: 'reconciled', group: null } : l)),
          proposals: proposals.filter((p) => !applied.has(p.group)),
          sheetOnly: [{ transactionId: 't-stream', description: 'Assinatura Streaming', amount: 39.9, type: 'EXPENSE', date: '2026-09-15', sourceRef: null }],
          payment,
          categoryMap: [
            { key: 'LIVRARIA GAMA', type: 'EXPENSE', count: 1, sections: ['credit'], suggestion: { kind: 'system', categoryName: 'EDUCATION', label: 'Educação' } },
            { key: 'Eletro Delta', type: 'EXPENSE', count: 1, sections: ['credit'], suggestion: { kind: 'default', label: 'Padrão' } },
          ],
          totals: { lines: lines.length, reconciled: 1, proposals: proposals.length, create: 2, sheetOnly: 1 },
          warnings,
        });
        const override = opts?.monthOverride;
        return override ? { ...out, month: override, monthKey: monthKey(override), monthSource: 'override' } : out;
      },
    };
    return card;
  }

  const OK = {
    enriched: 4, consumedFutures: 1, created: 2, futureInstallments: 2, reversalsImported: 0,
    payment: { action: 'adjusted', transactionId: 't-pay-09', amount: 900, date: '2026-09-09' }, skipped: 0,
    createdCategories: [{ id: 'c-livros', name: 'Livros', type: 'EXPENSE' }], warnings: [],
  };

  /** Fake card preview: answers at once, or (gate) waits for `gates[i].ok()` / `gates[i].fail(error)`. */
  function serveCard(card, { gate = false } = {}) {
    const gates = [];
    fake.cardPreview = (_u, body) => {
      const opts = optionsOf(body);
      if (!gate) return Promise.resolve({ data: { data: card.build(opts) } });
      return new Promise((resolve, reject) => {
        gates.push({ opts, ok: () => resolve({ data: { data: card.build(opts) } }), fail: (e) => reject(e) });
      });
    };
    return gates;
  }

  // ---- DOM helpers --------------------------------------------------------------------------------------------
  const ACCOUNTS = [
    { id: 'acc-main', householdId: 'h1', name: 'Conta Principal', type: 'CHECKING', isActive: true },
    { id: 'acc-card', householdId: 'h1', name: 'Nubank', type: 'CREDIT', isActive: true },
    { id: 'acc-card2', householdId: 'h1', name: 'Outro Cartão', type: 'CREDIT', isActive: true },
    { id: 'acc-savings', householdId: 'h1', name: 'Poupança', type: 'SAVINGS', isActive: true },
  ];
  let current = null;
  async function mountWith(render) {
    document.body.innerHTML = '<div id="root"></div>';
    w.localStorage.clear();
    fake.calls = [];
    for (const key of ['preview', 'workbook', 'confirm', 'cardPreview', 'cardConfirm', 'statementPreview']) fake[key] = null;
    globalThis.__toasts = [];
    globalThis.__defaultHousehold = undefined;
    globalThis.__accountsPayload = { accounts: clone(ACCOUNTS), totals: [] };
    globalThis.__categoriesPayload = [];
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const root = B.createRoot(document.getElementById('root'));
    let closed = 0;
    const onClose = () => { closed += 1; };
    const tree = () => B.createElement(B.QueryClientProvider, { client: qc }, render(onClose));
    await B.act(async () => { root.render(tree()); });
    await flush(30);
    current = { root, qc, get closed() { return closed; } };
    return current;
  }
  const mountCard = ({ initialFile = null } = {}) =>
    mountWith((onClose) => B.createElement(B.CardDialog, { open: true, onClose, accountId: 'acc-card', householdId: 'h1', initialFile }));
  const mountStatement = () => mountWith((onClose) => B.createElement(B.StatementDialog, { open: true, onClose, householdId: 'h1' }));
  async function unmountCard() {
    if (!current) return;
    const { root } = current;
    current = null;
    await B.act(async () => { root.unmount(); });
    document.body.innerHTML = '';
  }
  /** Every card scenario unmounts its own tree, failing or not. */
  const cardScenario = (name, fn) => scenario(name, async () => {
    try { await fn(); } finally { await unmountCard(); }
  });

  async function setFileOn(id, name) {
    const input = document.getElementById(id);
    assert.ok(input, `file input #${id} missing`);
    const file = new w.File(['OFXHEADER:100\n<OFX></OFX>'], name, { type: 'application/x-ofx' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await B.act(async () => { input.dispatchEvent(new w.Event('change', { bubbles: true })); });
    return file;
  }
  /** Sets an <input> value the way the browser does (bypassing React's value tracker) and fires `input`. */
  async function typeInto(el, value) {
    assert.ok(el, 'input missing');
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
    await B.act(async () => {
      setter.call(el, value);
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
    });
  }
  async function changeSelect(el, value) {
    assert.ok(el, 'select missing');
    await B.act(async () => { el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); });
    await flush(10);
  }
  async function toggle(el) {
    assert.ok(el, 'checkbox missing');
    await B.act(async () => { el.click(); });
    await flush(10);
  }
  const box = (label) => all('input[type=checkbox]').find((i) => i.getAttribute('aria-label') === label);
  const confirmBtn = () => btn(/^(Confirmar importação|Importando…)$/);
  const refreshBtn = () => btn(/^Atualizar pré-visualização$/);
  const cardConfirmCalls = () => fake.calls.filter((c) => c.kind === 'card-confirm');
  const cardPreviewCalls = () => fake.calls.filter((c) => c.kind === 'card-preview');
  const headerValue = (label) => all('dt').find((dt) => dt.textContent === label)?.nextElementSibling?.textContent ?? null;
  const sectionTitled = (re) => all('section').find((s) => re.test(s.querySelector('h4')?.textContent ?? ''));
  const footerText = () => confirmBtn().closest('div.pt-3').querySelector('p').textContent;
  const blockerText = () => document.getElementById('card-ofx-confirm-blocker')?.textContent ?? null;
  const backdrop = () => all('div[aria-hidden="true"]').find((d) => d.className.includes('bg-black/40'));
  const chipsIn = (el) => [...el.querySelectorAll('span')].map((s) => s.textContent);

  async function toCardPreview(card) {
    serveCard(card);
    const file = await setFileOn('card-ofx-file', 'fatura-outubro.ofx');
    const go = btn(/^Pré-visualizar$/);
    assert.ok(go && !go.disabled, 'Pré-visualizar must be enabled once the .ofx is chosen');
    await click(go);
    await flush(20);
    assert.ok(confirmBtn(), 'the preview step shows the confirm button');
    return file;
  }

  const GROUP_LABELS = {
    exact: 'Enriquecer com o OFX: Padaria',
    plan: 'Enriquecer com o OFX: Curso Alfa 4/10 +1',
    sum: 'Enriquecer com o OFX: Gasolina 200',
    paid: 'Enriquecer com o OFX: Pagamento antecipado',
    amb: 'Enriquecer com o OFX: Farmácia 50',
    future: 'Consumir parcela futura: Loja Beta 3/6',
    livraria: 'Importar nova: Livraria Gama',
    eletro: 'Importar nova: Eletro Delta - Parcela 1/3',
    rev: 'Importar compra e estorno: Site Omega',
  };
  const ticks = () => Object.fromEntries(Object.entries(GROUP_LABELS).map(([key, label]) => [key, box(label)?.checked ?? null]));

  // ---- scenarios ----------------------------------------------------------------------------------------------

  cardScenario('K1 card preview renders every section: header totals, reconciled, matched, futures, new, reversal, sheet-only, payment, advance payments', async () => {
    await mountCard();
    assert.equal(document.getElementById('card-ofx-file').getAttribute('accept'), '.ofx');
    assert.match(bodyText(), /Fatura do cartão \(\.ofx, até 5 MB\)/);
    assert.match(bodyText(), /Envie a fatura do cartão Nubank exportada como \.ofx/);
    await toCardPreview(makeCard());
    const [call] = cardPreviewCalls();
    assert.equal(call.url, '/transactions/import/card-ofx/preview');
    assert.equal(call.body.get('accountId'), 'acc-card');
    assert.equal(call.body.get('file').name, 'fatura-outubro.ofx');
    assert.equal(call.body.get('options'), null, 'no month override: no options');
    // header
    assert.equal(headerValue('Cartão'), 'Nubank');
    assert.equal(headerValue('Fatura'), 'Outubro/2026pelo fechamento do extrato');
    assert.equal(headerValue('Período do extrato'), '2026-09-02 a 2026-10-02');
    assert.equal(headerValue('Total do OFX'), 'R$ 919.06');
    assert.equal(headerValue('Total no Prumo após importar'), 'R$ 958.96R$ 39.90 a mais que o OFX');
    assert.equal(document.getElementById('card-ofx-month').value, '2026-10');
    // already reconciled: collapsed
    const reconciled = btn(/^Já conciliadas \(1\)$/);
    assert.equal(reconciled.getAttribute('aria-expanded'), 'false');
    assert.doesNotMatch(bodyText(), /Mercado Zeta/);
    await click(reconciled);
    assert.match(bodyText(), /Mercado Zeta/);
    // matched with the sheet: exact, plan, sum (one ambiguous), plus the advance payment paired with a sheet credit
    const matched = sectionTitled(/^Pareadas com a planilha \(5\)$/);
    assert.ok(matched, 'matched section');
    assert.match(matched.textContent, /4 marcadas/);
    assert.deepEqual(chipsIn(matched).filter((c) => ['exata', 'plano antecipado', 'soma', 'ambígua'].includes(c)),
      ['exata', 'plano antecipado', 'soma', 'exata', 'soma', 'ambígua']);
    const planRow = box(GROUP_LABELS.plan).closest('tr');
    for (const text of ['Curso Alfa - Parcela 4/10', 'Curso Alfa - Parcela 5/10', 'Desconto Antecipação Curso Alfa', '+R$ 12.34', 'Curso Alfa 4/10 +1',
      '2026-09-08 · R$ 187.66', 'Notas: + OFX: Curso Alfa - Parcela 4/10; Curso Alfa - Parcela 5/10; Desconto Antecipação Curso Alfa']) {
      assert.ok(planRow.textContent.includes(text), `plan row shows ${text}`);
    }
    assert.ok(chipsIn(planRow).includes('4/10') && chipsIn(planRow).includes('desconto'));
    const sumRow = box(GROUP_LABELS.sum).closest('tr');
    assert.equal((sumRow.textContent.match(/Posto Via Norte/g) ?? []).length, 2, 'the sum shows each OFX line it covers');
    // futures, new (with the category table), reversal
    assert.ok(sectionTitled(/^Parcelas futuras consumidas \(1\)$/));
    assert.ok(box(GROUP_LABELS.future).closest('tr').textContent.includes('Loja Beta 3/6'));
    const news = sectionTitled(/^Novas \(2\)$/);
    assert.ok(news, 'new section');
    assert.ok(chipsIn(news).includes('+2 parcelas futuras'));
    assert.equal(news.querySelector('[role="note"]'), null, 'no notice while the new lines come ticked');
    const catSelect = (key) => all('select').find((s) => s.getAttribute('aria-label') === `Categoria para ${key}`);
    assert.equal(catSelect('LIVRARIA GAMA').value, 'system:EDUCATION');
    assert.equal(catSelect('Eletro Delta').value, 'default');
    assert.ok(news.contains(catSelect('Eletro Delta')), 'the category table sits in the new section');
    const reversal = sectionTitled(/^Compra e estorno \(1\)$/);
    assert.ok(reversal.textContent.includes('+R$ 199.99') && chipsIn(reversal).includes('estorno'));
    assert.ok(box(GROUP_LABELS.rev).closest('tr').textContent.endsWith('R$ 0.00'), 'the pair nets zero');
    assert.deepEqual(ticks(), { exact: true, plan: true, sum: true, paid: true, amb: false, future: true, livraria: true, eletro: true, rev: false });
    // information only
    const sheetOnly = sectionTitled(/^Na planilha, mas não na fatura \(1\)$/);
    assert.ok(sheetOnly.textContent.includes('Assinatura Streaming') && sheetOnly.querySelectorAll('input').length === 0);
    const payment = sectionTitled(/^Pagamento da fatura de setembro\/2026$/);
    assert.match(payment.textContent, /No OFX: R\$ 900\.00 em 2026-09-09 \(Pagamento recebido\)\./);
    assert.match(payment.textContent, /Registrado no Prumo: R\$ 905\.00 em 2026-09-10, da conta Conta Principal\./);
    assert.ok(document.getElementById('card-ofx-payment').checked);
    assert.match(payment.textContent, /Substituir o pagamento registrado \(R\$ 905\.00 em 2026-09-10\) por um novo de R\$ 900\.00 em 2026-09-09/);
    assert.match(payment.textContent, /O pagamento atual é desfeito e registrado de novo; se houver mais de um pagamento registrado para essa fatura, eles viram um só\./);
    assert.match(payment.textContent, /O novo pagamento sai da mesma conta de origem\./);
    assert.equal(document.getElementById('card-ofx-payment-source'), null, 'adjust keeps the source account: no select');
    assert.ok(sectionTitled(/^Pagamentos antecipados \(2\)$/));
    // footer
    assert.equal(footerText(), '7 propostas marcadas · 4 a enriquecer · 1 parcela futura a consumir · 2 novas (R$ 345.50)');
    assert.match(bodyText(), /O pagamento registrado da fatura de setembro\/2026 será desfeito e registrado de novo: R\$ 900\.00 em 2026-09-09\./);
    assert.ok(!confirmBtn().disabled);
    assert.equal(blockerText(), null);
  });

  cardScenario('K2 group toggles and bulk links drive the footer, the Prumo total and the request (lines echoed, groups, categories, payment)', async () => {
    await mountCard();
    await toCardPreview(makeCard());
    await toggle(box(GROUP_LABELS.exact));
    await toggle(box(GROUP_LABELS.rev));
    await toggle(box(GROUP_LABELS.livraria));
    assert.equal(footerText(), '6 propostas marcadas · 3 a enriquecer · 1 parcela futura a consumir · 1 nova (R$ 300.00) · 1 par compra/estorno');
    assert.equal(headerValue('Total no Prumo após importar'), 'R$ 913.46R$ 5.60 a menos que o OFX', 'an unticked new line is not recorded');
    // bulk: "Marcar todas" never ticks the ambiguous sum; "Desmarcar todas" clears the section
    await click(btn(/^Desmarcar todas as pareadas$/));
    assert.deepEqual([ticks().exact, ticks().plan, ticks().sum, ticks().paid, ticks().amb], [false, false, false, false, false]);
    await click(btn(/^Marcar todas as pareadas$/));
    assert.deepEqual([ticks().exact, ticks().plan, ticks().sum, ticks().paid, ticks().amb], [true, true, true, true, false]);
    await toggle(box(GROUP_LABELS.exact));
    await changeSelect(all('select').find((s) => s.getAttribute('aria-label') === 'Categoria para Eletro Delta'), 'system:UTILITIES');
    fake.cardConfirm = async () => ({ data: OK });
    await click(confirmBtn());
    await flush(20);
    const calls = cardConfirmCalls();
    assert.equal(calls.length, 1, 'one request');
    const { payload, url } = calls[0];
    assert.equal(url, '/transactions/import/card-ofx/confirm');
    assert.deepEqual(Object.keys(payload).sort(), ['accountId', 'categoryMap', 'lines', 'monthKey', 'payment', 'paymentLineRef', 'selectedGroups']);
    assert.equal(payload.accountId, 'acc-card');
    assert.equal(payload.monthKey, '2026-10');
    assert.deepEqual(payload.selectedGroups, ['g-plan', 'g-sum', 'g-paid', 'g-future', 'g-eletro', 'g-rev']);
    assert.deepEqual(payload.categoryMap, [{ key: 'Eletro Delta', type: 'EXPENSE', target: { kind: 'system', categoryName: 'UTILITIES' } }]);
    assert.deepEqual(payload.payment, { apply: true });
    assert.equal(payload.lines.length, 17, 'every line goes back, reconciled and payments included');
    for (const l of payload.lines) assert.deepEqual(Object.keys(l).sort(), ['amount', 'date', 'fitid', 'installment', 'kind', 'memo', 'merchant', 'ref', 'type']);
    assert.deepEqual(payload.lines.find((l) => l.memo === 'Eletro Delta - Parcela 1/3').installment, { number: 1, total: 3 });
    assert.ok(JSON.parse(w.localStorage.getItem('prumo.maxfin.categoryChoices')).h1['EXPENSE|eletro delta'], 'the choice is remembered with the sheet ones');
  });

  cardScenario('K3 payment of the previous invoice to create: Confirm waits for a source account (never a card); the request carries it', async () => {
    await mountCard();
    await toCardPreview(makeCard({ paymentProposal: 'create' }));
    const payment = sectionTitled(/^Pagamento da fatura de setembro\/2026$/);
    assert.match(payment.textContent, /Nenhum pagamento registrado para essa fatura\./);
    assert.match(payment.textContent, /Registrar o pagamento de R\$ 900\.00 em 2026-09-09/);
    assert.ok(document.getElementById('card-ofx-payment').checked, 'the payment comes ticked');
    const source = () => document.getElementById('card-ofx-payment-source');
    assert.equal(source().value, '');
    assert.deepEqual([...source().options].map((o) => [o.value, o.textContent]),
      [['', 'Selecione a conta'], ['acc-main', 'Conta Principal'], ['acc-savings', 'Poupança']], 'credit cards cannot pay');
    assert.ok(confirmBtn().disabled);
    assert.equal(blockerText(), 'Escolha a conta de origem do pagamento da fatura anterior (ou desmarque o pagamento).');
    assert.ok(document.getElementById('card-ofx-payment-problem'));
    await click(confirmBtn());
    assert.equal(cardConfirmCalls().length, 0);
    await toggle(document.getElementById('card-ofx-payment'));
    assert.equal(source(), null, 'unticked: no source account asked');
    assert.ok(!confirmBtn().disabled, 'without the payment the rest can go');
    assert.doesNotMatch(bodyText(), /será registrado/);
    await toggle(document.getElementById('card-ofx-payment'));
    await changeSelect(source(), 'acc-main');
    assert.ok(!confirmBtn().disabled);
    assert.equal(blockerText(), null);
    assert.match(bodyText(), /O pagamento da fatura de setembro\/2026 será registrado: R\$ 900\.00 em 2026-09-09, da conta Conta Principal\./);
    fake.cardConfirm = async () => ({ data: { ...OK, payment: { action: 'created', transactionId: 't-new', amount: 900, date: '2026-09-09' } } });
    await click(confirmBtn());
    await flush(20);
    assert.deepEqual(cardConfirmCalls()[0].payload.payment, { apply: true, sourceAccountId: 'acc-main' });
    assert.match(bodyText(), /Pagamento da fatura anterior registrado: R\$ 900\.00 em 2026-09-09/);
  });

  cardScenario('K4 a failed confirm blocks Confirm until the preview is refreshed; the refresh shows what was applied as reconciled', async () => {
    const m = await mountCard();
    const card = makeCard();
    await toCardPreview(card);
    fake.cardConfirm = async () => { throw new Error('Falha de rede'); };
    await click(confirmBtn());
    await flush(20);
    assert.equal(cardConfirmCalls().length, 1);
    const message = 'Falha de rede. Atualize a pré-visualização antes de confirmar de novo: o que já tiver sido aplicado aparece como conciliado.';
    assert.ok(all('[role="alert"]').some((el) => el.textContent === message));
    assert.ok(globalThis.__toasts.some(([kind, text]) => kind === 'error' && text === message));
    assert.ok(confirmBtn().disabled);
    assert.equal(blockerText(), 'Atualize a pré-visualização antes de confirmar de novo.');
    assert.doesNotMatch(bodyText(), /será desfeito e registrado de novo/, 'no payment promise while stale');
    assert.ok(!btn(/Fechar modal/).disabled, 'nothing in flight: the dialog can close');
    await toggle(box(GROUP_LABELS.exact));
    await toggle(box(GROUP_LABELS.exact));
    assert.ok(confirmBtn().disabled, 'toggling a group does not unblock');
    await click(confirmBtn());
    assert.equal(cardConfirmCalls().length, 1, 'no second request from the stale preview');
    fake.cardPreview = async () => { throw new Error('Servidor indisponível'); };
    await click(refreshBtn());
    await flush(20);
    assert.ok(confirmBtn().disabled, 'a refresh that fails keeps Confirm blocked');
    assert.equal(blockerText(), 'Atualize a pré-visualização antes de confirmar de novo.');
    assert.ok(refreshBtn() && !refreshBtn().disabled, 'the refresh can be tried again');
    card.applied = new Set(['g-plan', 'g-sum']);
    serveCard(card);
    await click(refreshBtn());
    await flush(20);
    assert.equal(cardPreviewCalls().length, 3);
    assert.equal(cardPreviewCalls()[2].body.get('options'), null, 'same options as before (no override)');
    assert.ok(!confirmBtn().disabled, 'refreshed: Confirm is back');
    assert.equal(blockerText(), null);
    assert.ok(btn(/^Já conciliadas \(6\)$/), 'the applied lines come back reconciled');
    assert.ok(sectionTitled(/^Pareadas com a planilha \(3\)$/));
    fake.cardConfirm = async () => ({ data: OK });
    await click(confirmBtn());
    await flush(20);
    assert.deepEqual(cardConfirmCalls()[1].payload.selectedGroups, ['g-exact', 'g-paid', 'g-future', 'g-livraria', 'g-eletro']);
    assert.equal(m.closed, 0, 'the result step stays open');
  });

  cardScenario('K5 month override re-runs the preview and the latest request wins, in either answer order; a refresh repeats the override', async () => {
    await mountCard();
    const card = makeCard();
    await toCardPreview(card);
    const monthField = () => document.getElementById('card-ofx-month');
    const reprocess = () => btn(/^Reprocessar$/);
    assert.ok(reprocess().disabled, 'the month of the preview: nothing to re-run');
    const gates = serveCard(card, { gate: true });
    await typeInto(monthField(), '2026-11');
    await click(reprocess());
    assert.match(bodyText(), /Atualizando…/);
    assert.ok(box(GROUP_LABELS.exact).disabled, 'groups are locked while the preview runs');
    await typeInto(monthField(), '2026-12');
    assert.ok(!reprocess().disabled, 'the month stays editable while a preview runs');
    await click(reprocess());
    assert.equal(gates.length, 2);
    assert.deepEqual(gates.map((g) => g.opts), [{ monthOverride: { year: 2026, month: 11 } }, { monthOverride: { year: 2026, month: 12 } }]);
    await B.act(async () => { gates[1].ok(); });
    await flush(10);
    assert.equal(headerValue('Fatura'), 'Dezembro/2026informado manualmente');
    await B.act(async () => { gates[0].ok(); });
    await flush(10);
    assert.equal(headerValue('Fatura'), 'Dezembro/2026informado manualmente', 'the older answer arriving late is dropped');
    assert.equal(monthField().value, '2026-12');
    // the other order: the older request answers first and must not show up either
    await typeInto(monthField(), '2027-01');
    await click(reprocess());
    await typeInto(monthField(), '2027-02');
    await click(reprocess());
    await B.act(async () => { gates[2].ok(); });
    await flush(10);
    assert.equal(headerValue('Fatura'), 'Dezembro/2026informado manualmente', 'an answer older than the newest request is dropped');
    await B.act(async () => { gates[3].ok(); });
    await flush(10);
    assert.equal(headerValue('Fatura'), 'Fevereiro/2027informado manualmente');
    // a failed confirm, then the refresh: same override
    fake.cardConfirm = async () => { throw new Error('Tempo esgotado'); };
    serveCard(card);
    await click(confirmBtn());
    await flush(20);
    assert.equal(cardConfirmCalls()[0].payload.monthKey, '2027-02');
    await click(refreshBtn());
    await flush(20);
    assert.deepEqual(JSON.parse(cardPreviewCalls().at(-1).body.get('options')), { monthOverride: { year: 2027, month: 2 } });
    assert.ok(!confirmBtn().disabled);
  });

  cardScenario('K6 generic Import: a credit card account with a .ofx goes to the card flow (no raw statement preview); other cases stay', async () => {
    const m = await mountStatement();
    const card = makeCard();
    serveCard(card);
    fake.statementPreview = async () => ({ data: { data: { rows: [], total: 0, duplicateCount: 0, newCount: 0 } } });
    await changeSelect(document.getElementById('import-account'), 'acc-card');
    const file = await setFileOn('import-file', 'fatura.ofx');
    await click(btn(/^Pré-visualizar$/));
    await flush(30);
    assert.equal(fake.calls.filter((c) => c.kind === 'statement-preview').length, 0, 'the raw statement preview is not called');
    assert.equal(cardPreviewCalls().length, 1, 'the card preview starts right away');
    assert.equal(cardPreviewCalls()[0].body.get('accountId'), 'acc-card');
    assert.equal(cardPreviewCalls()[0].body.get('file'), file, 'the same file is handed over');
    assert.match(bodyText(), /Importar fatura do cartão \(OFX\)/);
    assert.doesNotMatch(bodyText(), /Importar transações/);
    assert.ok(sectionTitled(/^Pareadas com a planilha \(5\)$/));
    await B.act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    assert.equal(m.closed, 1, 'ESC closes the whole import once');
    await unmountCard();

    // a checking account with a .ofx, and a card with a .csv: the generic statement preview, as before
    for (const [accountId, name] of [['acc-main', 'extrato.ofx'], ['acc-card', 'fatura.csv']]) {
      await mountStatement();
      serveCard(card);
      fake.statementPreview = async () => ({ data: { data: { rows: [{ index: 0, date: '2026-09-10', description: 'Item', amount: 10, type: 'EXPENSE', duplicate: false }], total: 1, duplicateCount: 0, newCount: 1 } } });
      await changeSelect(document.getElementById('import-account'), accountId);
      await setFileOn('import-file', name);
      await click(btn(/^Pré-visualizar$/));
      await flush(20);
      assert.equal(fake.calls.filter((c) => c.kind === 'statement-preview').length, 1, `${accountId} + ${name}: statement preview`);
      assert.equal(cardPreviewCalls().length, 0, `${accountId} + ${name}: no card preview`);
      assert.match(bodyText(), /1 nova/);
      await unmountCard();
    }
  });

  cardScenario('K7 no closing while the confirm is in flight; then the result step lists what changed and Fechar closes', async () => {
    const m = await mountCard();
    await toCardPreview(makeCard());
    let release = null;
    fake.cardConfirm = () => new Promise((resolve) => { release = () => resolve({ data: { ...OK, warnings: ['Linha Padaria mudou de valor'] } }); });
    await click(confirmBtn());
    await flush(10);
    assert.equal(confirmBtn().textContent, 'Importando…');
    assert.ok(confirmBtn().disabled && btn(/^Voltar$/).disabled);
    assert.ok(btn(/Fechar modal/).disabled, 'X disabled');
    await B.act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await click(backdrop());
    assert.equal(m.closed, 0, 'neither ESC nor the backdrop closes mid-request');
    await click(confirmBtn());
    assert.equal(cardConfirmCalls().length, 1, 'one request');
    await B.act(async () => { release(); });
    await flush(20);
    assert.match(bodyText(), /Importação concluída/);
    const items = all('li').map((li) => li.textContent);
    for (const item of [
      '4 lançamentos da planilha enriquecidos com os dados do banco',
      '1 parcela futura substituída pela compra real',
      '2 transações criadas, mais 2 parcelas futuras',
      'Pagamento da fatura anterior ajustado: R$ 900.00 em 2026-09-09',
      '1 categoria criada: Livros',
      'Linha Padaria mudou de valor',
    ]) assert.ok(items.includes(item), `result shows: ${item} (${JSON.stringify(items)})`);
    assert.deepEqual(globalThis.__toasts.at(-1), ['success',
      'Fatura importada: 4 lançamentos enriquecidos, 1 parcela futura consumida, 2 transações criadas, 2 parcelas futuras geradas, '
      + 'pagamento ajustado (R$ 900.00), 1 categoria criada. 1 aviso.']);
    assert.ok(!btn(/Fechar modal/).disabled);
    await click(btn(/^Fechar$/));
    assert.equal(m.closed, 1);
  });

  cardScenario('K8 advance payments: only the previous invoice payment is in its block; a paired one sits in the matched section, an unpaired one is information', async () => {
    await mountCard();
    const card = makeCard();
    await toCardPreview(card);
    const { pagamento, antecipado, antecipadoPar } = card.named;
    const payment = sectionTitled(/^Pagamento da fatura de setembro\/2026$/);
    assert.doesNotMatch(payment.textContent, /150\.00|70\.00/, 'the advance payments are not in the previous invoice block');
    const advance = sectionTitled(/^Pagamentos antecipados \(2\)$/);
    assert.match(advance.textContent, /1 pareado com um crédito da planilha: em “Pareadas com a planilha”\./);
    assert.match(advance.textContent, /Sem par na planilha: ficam só como informação, não são importados\./);
    assert.match(advance.textContent, /2026-09-20Pagamento recebidopagamento\+R\$ 150\.00/);
    assert.equal(advance.querySelectorAll('input').length, 0, 'nothing to tick: never imported in this phase');
    assert.doesNotMatch(advance.textContent, /70\.00/);
    const paired = box(GROUP_LABELS.paid);
    assert.ok(paired.checked, 'the pair with the sheet credit is a normal exact match, ticked');
    assert.ok(chipsIn(paired.closest('tr')).includes('pagamento') && paired.closest('tr').textContent.includes('+R$ 70.00'));
    assert.equal(headerValue('Total do OFX'), 'R$ 919.06');
    assert.equal(headerValue('Total no Prumo após importar'), 'R$ 958.96R$ 39.90 a mais que o OFX', 'payments stay out of both totals');
    fake.cardConfirm = async () => ({ data: OK });
    await click(confirmBtn());
    await flush(20);
    const { payload } = cardConfirmCalls()[0];
    const refs = payload.lines.map((l) => l.ref);
    for (const l of [pagamento, antecipado, antecipadoPar]) assert.ok(refs.includes(l.ref), `payment line ${l.ref} echoed`);
    assert.ok(payload.selectedGroups.includes('g-paid'));
    assert.deepEqual(payload.payment, { apply: true }, 'the decision is about the previous invoice payment only');
  });

  cardScenario('K9 a month with sheet rows: new lines come unticked with a notice in the "Novas" section; "Marcar todas as novas" ticks them in bulk', async () => {
    await mountCard();
    const warning = 'Sobram 2 linhas no OFX (R$ 345,50) e 1 na planilha (R$ 39,90): as novas vieram desmarcadas.';
    const card = makeCard({ createsDefault: false, warnings: [warning] });
    await toCardPreview(card);
    assert.ok(all('li').some((li) => li.textContent === warning), 'the server warning is listed');
    const news = sectionTitled(/^Novas \(2\)$/);
    const note = news.querySelector('[role="note"]');
    assert.ok(note, 'the notice sits in the new section');
    assert.equal(note.textContent, 'Este mês já tem linhas da planilha: as novas vieram desmarcadas.'
      + 'Sobram no OFX 2 lançamentos (R$ 345.50); na planilha, sem par no OFX, 1 transação (R$ 39.90). Marque as novas que faltam no Prumo antes de confirmar.');
    assert.match(news.textContent, /0 marcadas/);
    assert.deepEqual([ticks().livraria, ticks().eletro], [false, false]);
    assert.equal(footerText(), '5 propostas marcadas · 4 a enriquecer · 1 parcela futura a consumir');
    assert.equal(headerValue('Total no Prumo após importar'), 'R$ 613.46R$ 305.60 a menos que o OFX');
    await click(btn(/^Marcar todas as novas$/));
    assert.deepEqual([ticks().livraria, ticks().eletro], [true, true]);
    assert.match(sectionTitled(/^Novas \(2\)$/).textContent, /2 marcadas/);
    assert.equal(footerText(), '7 propostas marcadas · 4 a enriquecer · 1 parcela futura a consumir · 2 novas (R$ 345.50)');
    await click(btn(/^Desmarcar todas as novas$/));
    assert.deepEqual([ticks().livraria, ticks().eletro], [false, false]);
    await click(btn(/^Marcar todas as novas$/));
    fake.cardConfirm = async () => ({ data: OK });
    await click(confirmBtn());
    await flush(20);
    const { payload } = cardConfirmCalls()[0];
    assert.deepEqual(payload.selectedGroups, ['g-exact', 'g-plan', 'g-sum', 'g-paid', 'g-future', 'g-livraria', 'g-eletro']);
    assert.deepEqual(payload.categoryMap.map((e) => e.key), ['LIVRARIA GAMA', 'Eletro Delta']);
  });

  cardScenario('K10 confirm invalidates the card invoice, transactions, accounts, dashboard and categories, on success and on failure', async () => {
    const m = await mountCard();
    const keys = [
      ['transactions', 'credit-card-invoice', 'acc-card', '2026-10', 'h1', 25, null],
      ['transactions', 'list', { householdId: 'h1' }],
      ['accounts', 'summary', 'h1'],
      ['dashboard', 'overview'],
      ['categories', 'stats'],
    ];
    const seed = () => { for (const key of keys) m.qc.setQueryData(key, { seeded: true }); };
    const invalidated = () => keys.map((key) => m.qc.getQueryState(key)?.isInvalidated ?? null);
    await toCardPreview(makeCard());
    seed();
    assert.deepEqual(invalidated(), [false, false, false, false, false]);
    fake.cardConfirm = async () => { throw new Error('Falha de rede'); };
    await click(confirmBtn());
    await flush(20);
    assert.deepEqual(invalidated(), [true, true, true, true, true], 'a failed confirm may have changed data: everything is refetched');
    seed();
    await click(refreshBtn());
    await flush(20);
    fake.cardConfirm = async () => ({ data: OK });
    await click(confirmBtn());
    await flush(20);
    assert.deepEqual(invalidated(), [true, true, true, true, true]);
  });

  cardScenario('K11 the card dialog refuses anything but .ofx up to 5 MB; a handed-over file that is not .ofx is not sent', async () => {
    await mountCard();
    await setFileOn('card-ofx-file', 'fatura.csv');
    assert.match(bodyText(), /Formato inválido\. Envie a fatura do cartão exportada como \.ofx\./);
    assert.ok(btn(/^Pré-visualizar$/).disabled);
    await unmountCard();
    await mountCard({ initialFile: new w.File(['x'], 'planilha.xlsx') });
    assert.equal(cardPreviewCalls().length, 0);
    assert.match(bodyText(), /Formato inválido/);
  });

  // ---- review round 1 -----------------------------------------------------------------------------------------

  cardScenario('RV-S1 StrictMode: the hand-off from the generic Import leaves exactly one applied preview, scroll lock restored, one ESC', async () => {
    const card = makeCard({ createsDefault: false });
    const m = await mountWith((onClose) => B.createElement(B.StrictMode, null, B.createElement(B.StatementDialog, { open: true, onClose, householdId: 'h1' })));
    serveCard(card);
    document.body.style.overflow = '';
    await changeSelect(document.getElementById('import-account'), 'acc-card');
    await setFileOn('import-file', 'fatura.ofx');
    await click(btn(/^Pré-visualizar$/));
    await flush(40);
    assert.ok(confirmBtn(), 'preview step shown');
    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(all('section[aria-labelledby="card-ofx-matched-title"]').length, 1, 'one preview on screen');
    assert.deepEqual([ticks().livraria, ticks().eletro, ticks().rev, ticks().amb, ticks().exact], [false, false, false, false, true],
      'creates of a month with sheet rows stay unticked, the rest follows the server');
    await B.act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    assert.equal(m.closed, 1, 'one close');
    await unmountCard();
    assert.equal(document.body.style.overflow, '', 'the scroll lock is released');
  });

  cardScenario('RV-S2 adjust of a payment whose recorded payment has no source account: a select is required and its choice is sent', async () => {
    await mountCard();
    const card = makeCard({ paymentProposal: 'adjust' });
    const orig = card.build;
    card.build = (o) => { const out = orig(o); out.payment.recorded.sourceAccountId = null; return out; };
    await toCardPreview(card);
    const payment = sectionTitled(/^Pagamento da fatura de setembro\/2026$/);
    assert.match(payment.textContent, /Substituir o pagamento registrado \(R\$ 905\.00 em 2026-09-10\) por um novo de R\$ 900\.00 em 2026-09-09/);
    assert.doesNotMatch(payment.textContent, /da conta/, 'no account to name');
    assert.match(payment.textContent, /não tem conta de origem/);
    assert.doesNotMatch(payment.textContent, /sai da mesma conta de origem/);
    const source = () => document.getElementById('card-ofx-payment-source');
    assert.ok(source(), 'a source account select is offered');
    assert.deepEqual([...source().options].map((o) => o.value), ['', 'acc-main', 'acc-savings']);
    assert.ok(confirmBtn().disabled, 'Confirm waits for it');
    assert.equal(blockerText(), 'Escolha a conta de origem do pagamento da fatura anterior (ou desmarque o pagamento).');
    await toggle(document.getElementById('card-ofx-payment'));
    assert.equal(source(), null);
    assert.ok(!confirmBtn().disabled, 'unticked: the rest can go');
    await toggle(document.getElementById('card-ofx-payment'));
    await changeSelect(source(), 'acc-savings');
    assert.ok(!confirmBtn().disabled);
    assert.match(bodyText(), /será desfeito e registrado de novo: R\$ 900\.00 em 2026-09-09, da conta Poupança\./);
    fake.cardConfirm = async () => ({ data: OK });
    await click(confirmBtn());
    await flush(20);
    assert.deepEqual(cardConfirmCalls()[0].payload.payment, { apply: true, sourceAccountId: 'acc-savings' });
  });

  cardScenario('RV-S2b adjust with a recorded source account asks for none and sends only apply', async () => {
    await mountCard();
    const card = makeCard({ paymentProposal: 'adjust' });
    await toCardPreview(card);
    assert.equal(document.getElementById('card-ofx-payment-source'), null);
    fake.cardConfirm = async () => ({ data: OK });
    await click(confirmBtn());
    await flush(20);
    assert.deepEqual(cardConfirmCalls()[0].payload.payment, { apply: true });
  });

  cardScenario('RV-S3 unticked defaults survive a month re-preview; a group the user ticked stays ticked', async () => {
    await mountCard();
    const card = makeCard({ createsDefault: false });
    await toCardPreview(card);
    assert.equal(ticks().livraria, false);
    await toggle(box(GROUP_LABELS.livraria));
    await toggle(box(GROUP_LABELS.exact));
    assert.deepEqual([ticks().livraria, ticks().eletro, ticks().rev, ticks().amb, ticks().exact], [true, false, false, false, false]);
    serveCard(card);
    await typeInto(document.getElementById('card-ofx-month'), '2026-11');
    await click(btn(/^Reprocessar$/));
    await flush(20);
    assert.deepEqual([ticks().livraria, ticks().eletro, ticks().rev, ticks().amb, ticks().exact], [true, false, false, false, false]);
  });

  cardScenario('RV-S4 the request keeps the order of the preview lines and of the proposals', async () => {
    await mountCard();
    const card = makeCard();
    await toCardPreview(card);
    fake.cardConfirm = async () => ({ data: OK });
    await click(confirmBtn());
    await flush(20);
    const p = cardConfirmCalls()[0].payload;
    const refs = card.build().lines.map((l) => l.ref);
    assert.notDeepEqual([...refs].sort(), refs, 'the fixture is not sorted by ref (K10 sorts before K2)');
    assert.deepEqual(p.lines.map((l) => l.ref), refs);
    assert.deepEqual(p.selectedGroups, ['g-exact', 'g-plan', 'g-sum', 'g-paid', 'g-future', 'g-livraria', 'g-eletro']);
    assert.deepEqual(p.categoryMap.map((c) => c.key), ['LIVRARIA GAMA', 'Eletro Delta']);
  });

  cardScenario('RV-S5 Confirm is disabled while a preview is being recomputed', async () => {
    await mountCard();
    const card = makeCard();
    await toCardPreview(card);
    const gates = serveCard(card, { gate: true });
    await typeInto(document.getElementById('card-ofx-month'), '2026-11');
    await click(btn(/^Reprocessar$/));
    assert.match(bodyText(), /Atualizando…/);
    assert.ok(confirmBtn().disabled, 'no confirm while the preview is being recomputed');
    await click(confirmBtn());
    assert.equal(cardConfirmCalls().length, 0);
    await B.act(async () => { gates[0].ok(); });
    await flush(10);
    assert.ok(!confirmBtn().disabled);
  });

  cardScenario('RV-S6 the household of the preview keys the remembered category choices; the reversal section says the tick is the server suggestion', async () => {
    await mountCard();
    const card = makeCard();
    const orig = card.build;
    card.build = (o) => ({ ...orig(o), householdId: 'h-preview' });
    await toCardPreview(card);
    assert.match(sectionTitled(/^Compra e estorno/).textContent, /A marcação inicial é a sugestão do servidor/);
    await changeSelect(all('select').find((s) => s.getAttribute('aria-label') === 'Categoria para Eletro Delta'), 'system:UTILITIES');
    assert.deepEqual(Object.keys(JSON.parse(w.localStorage.getItem('prumo.maxfin.categoryChoices'))), ['h-preview']);
  });

  cardScenario('RV-S7 inactive accounts are not offered as the source of the payment', async () => {
    await mountCard();
    globalThis.__accountsPayload.accounts.find((a) => a.id === 'acc-savings').isActive = false;
    await B.act(async () => { await current.qc.invalidateQueries({ queryKey: ['accounts'] }); });
    await flush(30);
    await toCardPreview(makeCard({ paymentProposal: 'create' }));
    assert.deepEqual([...document.getElementById('card-ofx-payment-source').options].map((o) => o.value), ['', 'acc-main']);
  });

  cardScenario('RV-S8 latest wins across a close: a preview answering after the dialog was closed and reopened never shows up', async () => {
    let isOpen = true;
    let closeCount = 0;
    const m = await mountWith((onClose) => B.createElement(B.CardDialog, { open: isOpen, onClose: () => { closeCount += 1; onClose(); }, accountId: 'acc-card', householdId: 'h1' }));
    const card = makeCard();
    const gates = serveCard(card, { gate: true });
    await setFileOn('card-ofx-file', 'fatura.ofx');
    await click(btn(/^Pré-visualizar$/));
    await flush(10);
    assert.equal(gates.length, 1);
    const render = async (open) => {
      isOpen = open;
      await B.act(async () => {
        m.root.render(B.createElement(B.QueryClientProvider, { client: m.qc },
          B.createElement(B.CardDialog, { open, onClose: () => {}, accountId: 'acc-card', householdId: 'h1' })));
      });
    };
    await render(false);
    await render(true);
    await flush(10);
    await B.act(async () => { gates[0].ok(); });
    await flush(20);
    assert.ok(btn(/^Pré-visualizar$/), 'still at the file step of the new session');
    assert.equal(confirmBtn(), undefined);
  });

  // ---- recurrence pairing (enrich-recurrence) ------------------------------------------------------------------
  /** An invoice whose lines pair with occurrences a recurrence generated: one plain pairing, one the server leaves unticked as ambiguous. */
  function makeRecurrenceCard() {
    const L = (n, memo, amount, date) => ({
      ref: `ofx:R${n}:${String(n).padStart(8, '0')}`, fitid: `R${n}`, date, amount, type: 'EXPENSE', kind: 'purchase', memo, merchant: memo,
      installment: null, status: 'proposed', group: null,
    });
    const T = (id, description, amount, date) => ({ transactionId: id, description, amount, type: 'EXPENSE', date, sourceRef: null });
    const plano = L(1, 'Pg Plano Beta Mensal', 47.9, '2026-09-12');
    const clube = L(2, 'Clube Gama', 32.25, '2026-09-13');
    plano.group = 'g-rec';
    clube.group = 'g-rec-amb';
    const proposals = [
      {
        group: 'g-rec', kind: 'enrich-recurrence', refs: [plano.ref], defaultSelected: true, ambiguous: false, reason: null, target: T('t-rec', 'Plano Beta', 50, '2026-09-10'),
        result: { date: '2026-09-12', description: 'Plano Beta', notesAppend: 'Banco: Pg Plano Beta Mensal (valor anterior 50,00)' }, futureInstallments: 0,
      },
      {
        group: 'g-rec-amb', kind: 'enrich-recurrence', refs: [clube.ref], defaultSelected: false, ambiguous: true, reason: 'recurrence-ambiguous', target: T('t-rec2', 'Clube Gama', 30, '2026-09-11'),
        result: { date: '2026-09-13', description: 'Clube Gama', notesAppend: 'Banco: Clube Gama (valor anterior 30,00)' }, futureInstallments: 0,
      },
    ];
    return {
      applied: new Set(),
      build() {
        return clone({
          accountId: 'acc-card', householdId: 'h1', month: { year: 2026, month: 10 }, monthKey: '2026-10', monthSource: 'statement',
          period: { start: '2026-09-02', end: '2026-10-02' }, ofxTotal: 80.15, lines: [plano, clube], proposals, sheetOnly: [], payment: null,
          categoryMap: [], totals: { lines: 2, reconciled: 0, proposals: 2, create: 0, sheetOnly: 0 }, warnings: [],
        });
      },
    };
  }

  cardScenario('K25 recurrence pairing: shown as "recorrência" in the matched section with before and after, ambiguous one unticked and explained, only the ticked one is sent', async () => {
    await mountCard();
    await toCardPreview(makeRecurrenceCard());
    const matched = sectionTitled(/^Pareadas com a planilha \(2\)$/);
    assert.ok(matched, 'a recurrence pairing sits in the matched section');
    assert.match(matched.textContent, /1 marcada/);
    assert.deepEqual(chipsIn(matched).filter((c) => c === 'recorrência'), ['recorrência', 'recorrência']);
    const plain = box('Parear com o lançamento gerado pela recorrência: Plano Beta');
    const held = box('Parear com o lançamento gerado pela recorrência: Clube Gama');
    assert.ok(plain && held, 'own checkbox labels');
    assert.equal(plain.checked, true);
    assert.equal(held.checked, false, 'ambiguous: unticked');
    const plainRow = plain.closest('tr');
    for (const text of ['Pg Plano Beta Mensal', 'Recorrência: o lançamento gerado passa a ter o valor e a data do banco e mantém o nome',
      'Valor: R$ 50.00 → R$ 47.90 (−R$ 2.10)', 'Plano Beta', '2026-09-12', 'Notas: + Banco: Pg Plano Beta Mensal (valor anterior 50,00)']) {
      assert.ok(plainRow.textContent.includes(text), `plain row shows ${text}`);
    }
    assert.doesNotMatch(plainRow.textContent, /Valor próximo/, 'not the near-amount text');
    const heldRow = held.closest('tr');
    assert.ok(chipsIn(heldRow).includes('recorrência, mais de uma opção'), 'reason chip');
    assert.match(heldRow.textContent, /confira se é o par certo antes de marcar/, 'visible explanation');
    assert.equal(plainRow.querySelector('[data-recurrence-ambiguity]'), null, 'the plain one has no explanation');
    assert.equal(footerText(), '1 proposta marcada · 1 a enriquecer');
    assert.equal(headerValue('Total no Prumo após importar'), 'R$ 77.90R$ 2.25 a menos que o OFX', '47.90 ticked + 30.00 held at its forecast');
    fake.cardConfirm = async () => ({ data: { ...OK, enriched: 1, consumedFutures: 0, created: 0, futureInstallments: 0, payment: null, createdCategories: [] } });
    await click(confirmBtn());
    await flush(20);
    assert.deepEqual(cardConfirmCalls()[0].payload.selectedGroups, ['g-rec']);
    assert.equal(cardConfirmCalls()[0].payload.lines.length, 2);
  });

  cardScenario('K26 recurrence pairing: ticking the ambiguous one sends both; unticking the plain one sends nothing for it and the totals fall back to the forecast amount', async () => {
    await mountCard();
    await toCardPreview(makeRecurrenceCard());
    const plain = box('Parear com o lançamento gerado pela recorrência: Plano Beta');
    const held = box('Parear com o lançamento gerado pela recorrência: Clube Gama');
    await toggle(held);
    assert.equal(footerText(), '2 propostas marcadas · 2 a enriquecer');
    assert.equal(headerValue('Total no Prumo após importar'), 'R$ 80.15igual ao OFX');
    await toggle(plain);
    assert.equal(headerValue('Total no Prumo após importar'), 'R$ 82.25R$ 2.10 a mais que o OFX', '50.00 forecast untouched + 32.25');
    fake.cardConfirm = async () => ({ data: { ...OK, enriched: 1, consumedFutures: 0, created: 0, futureInstallments: 0, payment: null, createdCategories: [] } });
    await click(confirmBtn());
    await flush(20);
    assert.deepEqual(cardConfirmCalls()[0].payload.selectedGroups, ['g-rec-amb']);
  });
}
