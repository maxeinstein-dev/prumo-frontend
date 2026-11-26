// usage: node forecast-scenarios.mjs [nameFilter]   -- the REAL ForecastStrategyField (in a small state harness that keeps the draft like the
// recurrence form does) and the REAL ConfirmReceiptDialog (bundled by build-forecast.mjs) under jsdom. The confirm dialog talks to a tiny
// stateful fake of PATCH /transactions/:id written independently of the client (it keeps the balance and the recurrence itself and knows
// that only the "último valor" strategy adopts a confirmed amount). Names FS*. Every name and amount is invented.
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const req = createRequire(process.env.JSDOM_FROM || new URL('../../package.json', import.meta.url));
const { JSDOM } = req('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
const B = await import(pathToFileURL(path.join(here, 'out', 'forecast.mjs')).href);

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = new Date(2026, 10, 27); // pinned clock: 27/11/2026

// ---- DOM helpers --------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = async (ms = 0) => { await B.act(async () => { await sleep(ms); }); };
const all = (sel) => [...document.body.querySelectorAll(sel)];
const bodyText = () => document.body.textContent ?? '';
const byId = (id) => document.getElementById(id);
const tid = (id) => document.querySelector(`[data-testid="${id}"]`);
const btn = (re) => all('button').find((b) => re.test((b.textContent ?? '').trim()));
async function click(el) { assert.ok(el, 'click target missing'); await B.act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); }); await flush(0); }
async function typeInto(el, value) {
  assert.ok(el, 'input missing');
  const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
  await B.act(async () => { setter.call(el, value); el.dispatchEvent(new w.Event('input', { bubbles: true })); });
  await flush(5);
}
async function choose(select, value) {
  assert.ok(select, 'select missing');
  const setter = Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set;
  await B.act(async () => { setter.call(select, value); select.dispatchEvent(new w.Event('change', { bubbles: true })); });
  await flush(5);
}
async function tick(checkbox) { await click(checkbox); }
const alerts = () => all('[role="alert"]').map((e) => e.textContent);

let current = null;
async function unmount() { if (!current) return; const { root } = current; current = null; await B.act(async () => { root.unmount(); }); document.body.innerHTML = ''; }

// ---- the form field -----------------------------------------------------------------------------------------
async function mountField(props = {}) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = B.createRoot(document.getElementById('root'));
  const render = async (next) => { Object.assign(props, next); await B.act(async () => { root.render(B.createElement(B.ForecastHarness, { ...props })); }); await flush(10); };
  await render({});
  current = { root, render };
  return current;
}
const payload = () => JSON.parse(tid('payload').textContent);
const select = () => tid('select-combobox');
const NEUTRAL = { forecastWindow: null, dailyRate: null, safetyBusinessDays: 0, nonWorkingDays: [], optionalHolidays: [] };

// ---- the confirm dialog + fake server -----------------------------------------------------------------------
function createServer({ strategy = 'PER_BUSINESS_DAY' } = {}) {
  const state = {
    balance: 1000, requests: [],
    recurrence: { id: 'rec-1', amount: 684, strategy, followLastAmount: strategy === 'LAST', dailyRate: strategy === 'PER_BUSINESS_DAY' ? 36 : null },
    tx: { id: 'tx-1', type: 'INCOME', amount: 684, date: '2026-10-25', paid: false, competenceMonth: '2026-11', recurringTransactionId: 'rec-1', notes: null },
  };
  return {
    state,
    patch(body) {
      state.requests.push(JSON.parse(JSON.stringify(body)));
      const t = state.tx;
      const newAmount = body.amount ?? t.amount;
      if (!t.paid && body.paid === true) state.balance += newAmount;
      t.amount = newAmount;
      if (body.paid !== undefined) t.paid = body.paid;
      if (body.date) t.date = body.date;
      const out = { ...t };
      // only the "último valor" strategy adopts the confirmed amount
      if (body.amount !== undefined && state.recurrence.strategy === 'LAST' && state.recurrence.followLastAmount && body.amount > 0) {
        state.recurrence.amount = body.amount;
        out.recurringUpdated = { id: 'rec-1', amount: body.amount };
      }
      return Promise.resolve(out);
    },
  };
}
const wire = (patch) => ({
  ...(patch.amount !== undefined && { amount: patch.amount }), paid: patch.paid, date: iso(patch.date),
  ...(patch.notes !== undefined && { notes: patch.notes || null }),
  ...(patch.competenceMonth !== undefined && { competenceMonth: patch.competenceMonth }),
});
const PER_DAY = { strategy: 'PER_BUSINESS_DAY', how: '19 dias úteis × R$ 36,00 (11/2026)', todayCents: 68400, perDay: { rateCents: 3600, countedDays: 19, businessDays: 19, referenceMonth: '2026-11' } };

async function mountDialog(server, { explanation = PER_DAY, tx, followsLastAmount = false } = {}) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = B.createRoot(document.getElementById('root'));
  const log = { closed: 0, confirmed: [] };
  const props = {
    transaction: tx ?? { ...server.state.tx, description: 'Vale alimentação' }, baseCurrency: 'BRL', followsLastAmount, explanation, today: () => TODAY,
    onConfirm: (patch) => server.patch(wire(patch)),
    onConfirmed: (info) => log.confirmed.push(info), onClose: () => { log.closed += 1; },
  };
  await B.act(async () => { root.render(B.createElement(B.ConfirmDialog, { ...props })); });
  await flush(10);
  current = { root, log, props };
  return current;
}
const submit = () => btn(/^Confirmar recebimento$/);
const hint = () => tid('confirm-hint')?.textContent ?? null;

const results = [];
const scenario = async (name, fn) => {
  if (filter && !filter.test(name)) return;
  try { await fn(); results.push([name, null]); console.log(`  ok   ${name}`); } catch (e) { results.push([name, e]); console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').slice(0, 6).join('\n       ')}`); } finally { await unmount(); }
};

// ---- scenarios: the field "Como prever o valor" --------------------------------------------------------------
await scenario('FS1 opens on "Último valor": the four modes, its help text and the follow-last slot; no other parameter', async () => {
  await mountField();
  assert.match(bodyText(), /Como prever o valor/);
  assert.deepEqual([...select().options].map((o) => o.textContent), ['Último valor', 'Valor fixo', 'Conservador', 'Por dia útil']);
  assert.equal(select().value, 'LAST');
  assert.match(tid('forecast-help').textContent, /^O próximo mês usa o valor do último mês\./);
  assert.ok(byId('follow-last'), 'the follow-last checkbox is the content of the last-value mode');
  for (const id of ['forecast-window', 'forecast-daily-rate', 'forecast-safety', 'forecast-non-working']) assert.equal(byId(id), null, id);
  assert.deepEqual(payload(), { forecastStrategy: 'LAST', ...NEUTRAL });
});

await scenario('FS2 "Valor fixo": its explanation, no follow-last slot, no parameter fields', async () => {
  await mountField();
  await choose(select(), 'FIXED');
  assert.match(tid('forecast-help').textContent, /^Sempre o valor que você digitou\./);
  assert.equal(byId('follow-last'), null);
  assert.equal(byId('forecast-window'), null);
  assert.deepEqual(payload(), { forecastStrategy: 'FIXED', ...NEUTRAL });
});

await scenario('FS3 "Conservador": income looks at the smallest (default 6), expense at the largest (default 3); N validated and sent', async () => {
  await mountField({ kind: 'INCOME' });
  await choose(select(), 'CONSERVATIVE');
  assert.match(tid('forecast-help').textContent, /MENOR dos últimos valores recebidos/);
  assert.equal(byId('forecast-window').placeholder, 'Padrão: 6');
  assert.equal(payload().forecastWindow, null, 'blank = the default of the kind');
  await typeInto(byId('forecast-window'), '4');
  assert.deepEqual(payload(), { forecastStrategy: 'CONSERVATIVE', ...NEUTRAL, forecastWindow: 4 });
  await typeInto(byId('forecast-window'), '0');
  assert.deepEqual(alerts(), ['Informe um número de 1 a 36.']);
  await typeInto(byId('forecast-window'), '3a6');
  assert.equal(byId('forecast-window').value, '36', 'only digits are kept');
  assert.deepEqual(alerts(), []);
  await current.render({ kind: 'EXPENSE' });
  assert.match(tid('forecast-help').textContent, /MAIOR dos últimos valores pagos/);
  assert.equal(byId('forecast-window').placeholder, 'Padrão: 3');
});

await scenario('FS4 "Por dia útil": the rate mask, the live preview "N dias úteis × R$ X", the margin and the days without voucher', async () => {
  await mountField();
  await choose(select(), 'PER_BUSINESS_DAY');
  assert.equal(tid('forecast-preview'), null, 'no preview without a rate');
  await typeInto(byId('forecast-daily-rate'), '3600');
  assert.equal(byId('forecast-daily-rate').value, 'R$ 36,00');
  assert.equal(tid('forecast-preview').textContent, 'Previsão de 11/2026: R$ 684,00 (19 dias úteis × R$ 36,00)');
  await typeInto(byId('forecast-safety'), '2');
  assert.equal(tid('forecast-preview').textContent, 'Previsão de 11/2026: R$ 612,00 (19 dias úteis − 2 de margem = 17 dias × R$ 36,00)');
  await typeInto(byId('forecast-non-working'), '03/11, 24/11');
  assert.equal(tid('forecast-preview').textContent, 'Previsão de 11/2026: R$ 540,00 (17 dias úteis − 2 de margem = 15 dias × R$ 36,00)');
  assert.deepEqual(payload(), { forecastStrategy: 'PER_BUSINESS_DAY', forecastWindow: null, dailyRate: 36, safetyBusinessDays: 2, nonWorkingDays: ['11-03', '11-24'], optionalHolidays: [] });
});

await scenario('FS5 optional holidays (Carnaval, Corpus Christi) and the month of the preview follow the next occurrence', async () => {
  await mountField({ referenceMonth: '2026-02' });
  await choose(select(), 'PER_BUSINESS_DAY');
  await typeInto(byId('forecast-daily-rate'), '3600');
  assert.match(tid('forecast-preview').textContent, /^Previsão de 02\/2026: R\$ 720,00 \(20 dias úteis × R\$ 36,00\)$/);
  await tick(byId('forecast-carnival'));
  assert.match(tid('forecast-preview').textContent, /R\$ 648,00 \(18 dias úteis × R\$ 36,00\)$/);
  assert.deepEqual(payload().optionalHolidays, ['CARNIVAL']);
  await tick(byId('forecast-corpus'));
  assert.deepEqual(payload().optionalHolidays, ['CARNIVAL', 'CORPUS_CHRISTI']);
  await current.render({ referenceMonth: '2026-12' });
  assert.match(tid('forecast-preview').textContent, /^Previsão de 12\/2026: R\$ 792,00 \(22 dias úteis × R\$ 36,00\)$/);
});

await scenario('FS6 errors: an invalid day without voucher at once; the missing rate only after a save attempt; per day needs a monthly recurrence', async () => {
  await mountField();
  await choose(select(), 'PER_BUSINESS_DAY');
  assert.deepEqual(alerts(), [], 'nothing shouted at a form that was just opened');
  await typeInto(byId('forecast-non-working'), '24/06, 31/04');
  assert.match(alerts().join(' '), /Data inválida: 31\/04/);
  await typeInto(byId('forecast-non-working'), '24/06');
  assert.deepEqual(alerts(), []);
  await current.render({ showErrors: true });
  assert.deepEqual(alerts(), ['Informe o valor por dia útil.']);
  await typeInto(byId('forecast-daily-rate'), '3600');
  assert.deepEqual(alerts(), []);
  await current.render({ frequency: 'weekly' });
  assert.match(alerts().join(' '), /só vale para recorrência mensal/);
});

await scenario('FS7 switching modes leaves nothing stale in the request: the per-day values go away with the mode', async () => {
  await mountField();
  await choose(select(), 'PER_BUSINESS_DAY');
  await typeInto(byId('forecast-daily-rate'), '3600');
  await typeInto(byId('forecast-safety'), '2');
  await tick(byId('forecast-carnival'));
  assert.equal(payload().dailyRate, 36);
  await choose(select(), 'FIXED');
  assert.deepEqual(payload(), { forecastStrategy: 'FIXED', ...NEUTRAL });
  await choose(select(), 'PER_BUSINESS_DAY');
  assert.equal(byId('forecast-daily-rate').value, 'R$ 36,00', 'the draft keeps what was typed while the form is open');
  assert.equal(payload().dailyRate, 36);
});

await scenario('FS8 a stored recurrence opens with its own values', async () => {
  const initial = { strategy: 'PER_BUSINESS_DAY', windowText: '', dailyRateCents: 3600, safetyText: '1', nonWorkingText: '24/06, 08/07/2026', carnival: true, corpusChristi: false };
  await mountField({ initial });
  assert.equal(select().value, 'PER_BUSINESS_DAY');
  assert.equal(byId('forecast-daily-rate').value, 'R$ 36,00');
  assert.equal(byId('forecast-safety').value, '1');
  assert.equal(byId('forecast-non-working').value, '24/06, 08/07/2026');
  assert.equal(byId('forecast-carnival').checked, true);
  assert.equal(byId('forecast-corpus').checked, false);
  assert.match(tid('forecast-preview').textContent, /R\$ 648,00 \(19 dias úteis − 1 de margem = 18 dias × R\$ 36,00\)$/);
});

await scenario('FS9 a rate with too many digits is not cleared by the extra key', async () => {
  await mountField();
  await choose(select(), 'PER_BUSINESS_DAY');
  await typeInto(byId('forecast-daily-rate'), '3600');
  await typeInto(byId('forecast-daily-rate'), 'R$ 36,00123456789012');
  assert.equal(byId('forecast-daily-rate').value, 'R$ 36,00');
  assert.equal(payload().dailyRate, 36);
  await typeInto(byId('forecast-daily-rate'), '');
  assert.equal(payload().dailyRate, null, 'emptying it does clear');
});

// ---- scenarios: "Confirmar recebimento" -----------------------------------------------------------------------
await scenario('FS10 per-day: the dialog says how the expected amount was reached and what it stands for (19 days)', async () => {
  const server = createServer();
  await mountDialog(server);
  assert.match(bodyText(), /esperado R\$ 684\.00 em 25\/10\/2026/);
  assert.equal(tid('confirm-how').textContent.replace(/\s+/g, ' ').trim(), 'Como foi calculado: 19 dias úteis × R$ 36,00 (11/2026).');
  assert.equal(tid('confirm-implied').textContent, 'Equivale a 19 dias (R$ 684.00 ÷ R$ 36.00).');
  assert.equal(tid('confirm-implied-suggestion'), null, 'same days as calculated: nothing to suggest');
  assert.equal(server.state.requests.length, 0);
});

await scenario('FS11 per-day: the received amount shows its implied days and, when they differ, suggests a day without voucher or a new rate', async () => {
  const server = createServer();
  await mountDialog(server);
  await typeInto(byId('confirm-amount'), '64800');
  assert.equal(tid('confirm-implied').textContent, 'Equivale a 18 dias (R$ 648.00 ÷ R$ 36.00).');
  assert.equal(tid('confirm-implied-suggestion').textContent, 'O cálculo usou 19 dias úteis de 11/2026. Se algum dia não teve vale, cadastre-o como dia sem vale; se o valor do dia mudou, ajuste o valor por dia.');
  assert.equal(hint(), 'Esperado R$ 684.00, recebido R$ 648.00; a previsão dos próximos meses continua pelo valor por dia útil.');
  await typeInto(byId('confirm-amount'), '70200');
  assert.equal(tid('confirm-implied').textContent, 'Equivale a 19,5 dias (R$ 702.00 ÷ R$ 36.00).');
  assert.match(tid('confirm-implied-suggestion').textContent, /Se um dia que você descontou foi pago, retire-o dos dias sem vale/);
  await typeInto(byId('confirm-amount'), '68400');
  assert.equal(tid('confirm-implied-suggestion'), null);
  assert.equal(hint(), null);
  await typeInto(byId('confirm-amount'), '');
  assert.equal(tid('confirm-implied'), null, 'no days for an empty amount');
});

await scenario('FS12 per-day: confirming a different amount sends it once, moves the balance once and does NOT overwrite the recurrence', async () => {
  const server = createServer();
  await mountDialog(server);
  await typeInto(byId('confirm-amount'), '64800');
  await click(submit());
  await flush(20);
  assert.deepEqual(server.state.requests, [{ amount: 648, paid: true, date: iso(TODAY) }]);
  assert.equal(server.state.balance, 1648);
  assert.deepEqual({ amount: server.state.recurrence.amount, rate: server.state.recurrence.dailyRate }, { amount: 684, rate: 36 }, 'the recurrence keeps its amount and its rate');
  assert.equal(current.log.confirmed[0].result.recurringUpdated, undefined, 'no "Recorrência atualizada" notice');
  assert.equal(current.log.closed, 1);
});

await scenario('FS13 the explanation can differ from the stored expected amount: it says what today\'s configuration would give', async () => {
  const server = createServer();
  await mountDialog(server, { explanation: { ...PER_DAY, how: '20 dias úteis × R$ 36,00 (11/2026)', todayCents: 72000, perDay: { ...PER_DAY.perDay, countedDays: 20, businessDays: 20 } } });
  assert.match(tid('confirm-how').textContent, /Com a configuração de hoje o cálculo daria R\$ 720\.00\./);
  assert.equal(tid('confirm-implied').textContent, 'Equivale a 19 dias (R$ 684.00 ÷ R$ 36.00).');
  assert.match(tid('confirm-implied-suggestion').textContent, /^O cálculo usou 20 dias úteis de 11\/2026\./);
});

await scenario('FS14 per-day with a margin: the suggestion names the margin', async () => {
  const server = createServer();
  await mountDialog(server, { explanation: { ...PER_DAY, how: '19 dias úteis − 2 de margem = 17 dias × R$ 36,00 (11/2026)', todayCents: 61200, perDay: { ...PER_DAY.perDay, countedDays: 17, businessDays: 19 } }, tx: { ...createServer().state.tx, amount: 612, description: 'Vale' } });
  await typeInto(byId('confirm-amount'), '64800');
  assert.match(tid('confirm-implied-suggestion').textContent, /^O cálculo usou 17 dias \(19 dias úteis menos a margem\)\./);
});

await scenario('FS15 fixed: how it was calculated, no days note, and the hint says the forecast stays the fixed value', async () => {
  const server = createServer({ strategy: 'FIXED' });
  await mountDialog(server, { explanation: { strategy: 'FIXED', how: 'valor fixo (11/2026)', todayCents: 68400, perDay: null } });
  assert.match(tid('confirm-how').textContent, /Como foi calculado: valor fixo \(11\/2026\)\./);
  assert.equal(tid('confirm-implied'), null);
  await typeInto(byId('confirm-amount'), '64800');
  assert.equal(hint(), 'Esperado R$ 684.00, recebido R$ 648.00; a previsão dos próximos meses continua o valor fixo.');
  await click(submit());
  await flush(20);
  assert.equal(server.state.recurrence.amount, 684, 'a fixed recurrence does not adopt the confirmed amount');
});

await scenario('FS16 conservative: the confirmed value joins the history (said in the hint) and the recurrence amount stays', async () => {
  const server = createServer({ strategy: 'CONSERVATIVE' });
  await mountDialog(server, { explanation: { strategy: 'CONSERVATIVE', how: 'conservador: menor dos últimos 6 recebidos', todayCents: null, perDay: null } });
  assert.match(tid('confirm-how').textContent, /conservador: menor dos últimos 6 recebidos/);
  assert.doesNotMatch(tid('confirm-how').textContent, /configuração de hoje/, 'no made-up "today" amount without the history');
  await typeInto(byId('confirm-amount'), '64800');
  assert.equal(hint(), 'Esperado R$ 684.00, recebido R$ 648.00; este valor entra no histórico da previsão conservadora.');
  await click(submit());
  await flush(20);
  assert.equal(server.state.recurrence.amount, 684);
  assert.equal(server.state.balance, 1648);
});

await scenario('FS17 the last value is unchanged: no explanation lines, and the follow-last hint still wins', async () => {
  const server = createServer({ strategy: 'LAST' });
  await mountDialog(server, { explanation: null, followsLastAmount: true });
  assert.equal(tid('confirm-how'), null);
  assert.equal(tid('confirm-implied'), null);
  await typeInto(byId('confirm-amount'), '64800');
  assert.equal(hint(), 'Esperado R$ 684.00, recebido R$ 648.00; as próximas ocorrências passam a usar R$ 648.00.');
  await click(submit());
  await flush(20);
  assert.equal(server.state.recurrence.amount, 648, 'the last-value strategy still adopts it');
  assert.deepEqual(current.log.confirmed[0].result.recurringUpdated, { id: 'rec-1', amount: 648 });
});

const failed = results.filter(([, e]) => e);
console.log(`\nforecast field and confirm dialog: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
