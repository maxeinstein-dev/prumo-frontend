// Gap C: a small stateful fake of GET /transactions/import/card-ofx/review-queue and POST .../review-queue/actions (the HTTP
// contract of specs/import-maxfin-fase3-ofx.md section C, not the real backend). It decides everything itself, independently
// of the client: which rows are listed, the month totals, what each action does to a row and what each answer says.
// Invented data only. `server.hold(kind)` holds the next request, `failNext(kind, status, message)` fails it,
// `failRow(id, reason)` makes the next action on a row come back `failed`, `changeUnderfoot(id, patch)` edits a row so the
// next apply finds it different from what the list showed.
const clone = (v) => JSON.parse(JSON.stringify(v));

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const cents = (r) => (r.type === 'INCOME' ? -1 : 1) * Math.round(r.amount * 100);

export function createReviewServer({ cardId = 'acc-card', rows = [], accounts = [] } = {}) {
  const state = { rows: clone(rows).map((r) => ({ status: 'queue', anchored: true, ...r })), accounts: clone(accounts), moved: [], deleted: [], seq: 0 };
  const holds = { get: [], post: [] };
  const fails = { get: [], post: [] };
  const rowFailures = new Map();
  const kindOf = (method) => (method === 'GET' ? 'get' : 'post');

  const listed = (view) => state.rows.filter((r) => r.status === (view === 'kept' ? 'kept' : 'queue'));

  function getQueue(params) {
    if (params.accountId !== cardId) throw new HttpError(404, 'Conta não encontrada');
    const view = params.view === 'kept' ? 'kept' : 'queue';
    const limit = Math.min(Number(params.limit ?? 200), 500);
    let pool = listed(view);
    if (params.monthKey) pool = pool.filter((r) => r.monthKey === params.monthKey);
    pool = [...pool].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const items = pool.slice(0, limit).map((r) => ({
      transactionId: r.id, description: r.description, amount: r.amount, type: r.type, date: r.date, sourceRef: `maxfin:${r.monthKey}:credit:${r.id}`,
      monthKey: r.monthKey, categoryName: r.categoryName ?? null, blocked: r.blocked === true,
    }));
    const byMonth = new Map();
    for (const r of pool) {
      const m = byMonth.get(r.monthKey) ?? { monthKey: r.monthKey, count: 0, cents: 0 };
      m.count += 1;
      m.cents += cents(r);
      byMonth.set(r.monthKey, m);
    }
    const months = [...byMonth.values()].sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1)).map((m) => ({ monthKey: m.monthKey, count: m.count, net: m.cents / 100 }));
    return {
      accountId: cardId, items, months, totals: { count: pool.length, net: pool.reduce((s, r) => s + cents(r), 0) / 100 }, view, truncated: pool.length > limit,
    };
  }

  function postActions(body) {
    if (body.accountId !== cardId) throw new HttpError(404, 'Conta não encontrada');
    if (!Array.isArray(body.actions) || body.actions.length === 0 || body.actions.length > 200) throw new HttpError(400, 'Entre 1 e 200 ações');
    // A bad destination refuses the whole request before anything is written.
    for (const a of body.actions) {
      if (a.action !== 'move') continue;
      const target = state.accounts.find((x) => x.id === a.targetAccountId);
      if (!target || target.type === 'CREDIT' || target.isActive === false) throw new HttpError(400, 'Conta de destino inválida');
    }
    const results = [];
    const warnings = [];
    for (const a of body.actions) {
      const row = state.rows.find((r) => r.id === a.transactionId);
      const push = (status, reason) => results.push({ transactionId: a.transactionId, action: a.action, status, ...(reason ? { reason } : {}) });
      const failure = rowFailures.get(a.transactionId);
      if (failure && a.action !== 'unkeep') { rowFailures.delete(a.transactionId); push('failed', failure); continue; }
      if (a.action === 'unkeep') {
        if (row && row.status === 'kept') { row.status = 'queue'; push('done'); } else push('skipped');
        continue;
      }
      if (!row || row.status !== 'queue') { push('skipped'); continue; }
      if (a.action === 'keep') { row.status = 'kept'; push('done'); continue; }
      if (row.blocked) { push('blocked', 'has-shares-split-settlement-recurrence-or-attachment'); continue; }
      if (a.action === 'move') {
        row.status = 'moved';
        state.moved.push({ id: row.id, to: a.targetAccountId });
        push('done');
      } else {
        row.status = 'deleted';
        state.deleted.push(row.id);
        if (!row.anchored) warnings.push(`A planilha traz a linha "${row.description}" de volta: não havia linha do mesmo mês amarrada ao OFX para ancorar o marcador de remoção.`);
        push('done');
      }
    }
    const count = (s) => results.filter((r) => r.status === s).length;
    return { results, done: count('done'), skipped: count('skipped'), blocked: count('blocked'), failed: count('failed'), warnings };
  }

  return {
    state,
    hold(kind) {
      let resolve;
      const promise = new Promise((res) => { resolve = res; });
      const handle = { promise, release: () => resolve({}), fail: (error) => resolve({ error }) };
      holds[kind].push(handle);
      return handle;
    },
    failNext(kind, status, message) { fails[kind].push(new HttpError(status, message)); },
    failRow(id, reason) { rowFailures.set(id, reason); },
    changeUnderfoot(id, patch) { Object.assign(state.rows.find((r) => r.id === id), patch); },
    /** Hands out an answer computed by the test instead of the one the fake would compute (a misbehaving server). */
    overrideNext: null,
    async handle(method, url, payload) {
      const kind = kindOf(method);
      const held = holds[kind].shift();
      // The answer is computed when the request ARRIVES (what the server knew then), delivered when it is released.
      const failure = fails[kind].shift();
      let data;
      if (!failure) {
        if (this.overrideNext && method === 'POST') { data = this.overrideNext(payload); this.overrideNext = null; }
        else data = method === 'GET' ? getQueue(payload ?? {}) : postActions(payload);
      }
      if (held) {
        const answer = await held.promise;
        if (answer.error) throw answer.error;
      }
      if (failure) throw failure;
      return { success: true, data: clone(data) };
    },
  };
}
