// Phase 4: a small stateful fake of the people endpoints (the HTTP contract of the spec, not the real backend).
// Written independently of the client logic: strategies, balances and the ledger are computed here from the stored
// rows, so a scenario can compare what the dialogs show with what the "server" would answer. All data is invented.
import assert from 'node:assert/strict';

const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const cents = (reais) => Math.round(reais * 100 + 1e-6);
const reais = (c) => c / 100;
const clone = (v) => JSON.parse(JSON.stringify(v));

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** The server rule for the split strategies: parts in cents, remainder to the first person. */
export function serverParts(totalCents, input) {
  const entries = input.entries;
  const n = entries.length;
  if (n === 0) return [];
  if (input.strategy === 'exact') return entries.map((e) => cents(e.amount));
  if (input.strategy === 'equal') {
    const base = Math.floor(totalCents / (n + 1));
    return entries.map((_, i) => base + (i === 0 ? totalCents - base * (n + 1) : 0));
  }
  if (input.strategy === 'shares') {
    const mine = input.myShares ?? 1;
    const denom = mine + entries.reduce((a, e) => a + e.shares, 0);
    const parts = entries.map((e) => Math.floor((totalCents * e.shares) / denom));
    parts[0] += totalCents - Math.floor((totalCents * mine) / denom) - parts.reduce((a, p) => a + p, 0);
    return parts;
  }
  const parts = entries.map((e) => Math.floor((totalCents * Math.round(e.percent * 100)) / 10000));
  if (entries.reduce((a, e) => a + Math.round(e.percent * 100), 0) === 10000) parts[0] += totalCents - parts.reduce((a, p) => a + p, 0);
  return parts;
}

export function createPeopleServer({ people = [], transactions = [] } = {}) {
  const state = {
    people: clone(people),
    transactions: clone(transactions),
    shares: [],
    settlements: [],
    seq: 0,
    organizePreview: null,
    organizeApply: null,
  };
  const intercepts = [];
  const gates = [];
  const nextId = (prefix) => `${prefix}${(state.seq += 1)}`;

  const personById = (id) => state.people.find((p) => p.id === id);
  const txById = (id) => state.transactions.find((t) => t.id === id);
  const sharesOf = (txId) => state.shares.filter((s) => s.transactionId === txId);

  function balanceOf(person) {
    const mine = state.shares.filter((s) => s.personId === person.id);
    const sets = state.settlements.filter((s) => s.personId === person.id);
    const sum = (list) => list.reduce((a, x) => a + x.amount, 0);
    const owedToMe = sum(mine.filter((s) => s.direction === 'THEY_OWE_ME'));
    const iOwe = sum(mine.filter((s) => s.direction === 'I_OWE_THEM'));
    const received = sum(sets.filter((s) => s.direction === 'RECEIVED'));
    const paid = sum(sets.filter((s) => s.direction === 'PAID'));
    return {
      person: clone(person), owedToMe: reais(owedToMe), iOwe: reais(iOwe), received: reais(received), paid: reais(paid),
      balance: reais(owedToMe - iOwe - received + paid), openShares: mine.length,
    };
  }

  function ledgerOf(person) {
    const rows = [];
    for (const s of state.shares.filter((x) => x.personId === person.id)) {
      const tx = txById(s.transactionId);
      rows.push({
        seq: s.seq, kind: 'share', id: s.id, date: tx.date, description: tx.description, direction: s.direction, amountC: s.amount,
        signedC: s.direction === 'THEY_OWE_ME' ? s.amount : -s.amount, transactionId: tx.id, transactionAmount: tx.amount, note: s.note ?? null, source: s.source,
      });
    }
    for (const s of state.settlements.filter((x) => x.personId === person.id)) {
      const tx = s.transactionId ? txById(s.transactionId) : null;
      rows.push({
        seq: s.seq, kind: 'settlement', id: s.id, date: s.date, description: tx ? tx.description : 'Acerto', direction: s.direction, amountC: s.amount,
        signedC: s.direction === 'RECEIVED' ? -s.amount : s.amount, transactionId: s.transactionId, transactionAmount: tx ? tx.amount : null, note: s.note ?? null, source: null,
      });
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
    let running = 0;
    return rows.map((r) => {
      running += r.signedC;
      return {
        kind: r.kind, id: r.id, date: r.date, description: r.description, direction: r.direction, amount: reais(r.amountC), signed: reais(r.signedC),
        balanceAfter: reais(running), transactionId: r.transactionId, transactionAmount: r.transactionAmount, note: r.note, source: r.source,
      };
    });
  }

  function sharesResponse(tx) {
    const list = sharesOf(tx.id);
    const theirs = list.filter((s) => s.direction === 'THEY_OWE_ME').reduce((a, s) => a + s.amount, 0);
    return {
      transactionId: tx.id, transactionAmount: tx.amount,
      shares: list.map((s) => ({
        id: s.id, transactionId: tx.id, personId: s.personId, personName: personById(s.personId)?.name ?? '?', direction: s.direction,
        amount: reais(s.amount), note: s.note ?? null, source: s.source,
      })),
      myPart: reais(cents(tx.amount) - theirs),
    };
  }

  function validateShares(tx, input) {
    const total = cents(tx.amount);
    const parts = serverParts(total, input);
    const seen = new Set();
    input.entries.forEach((e) => {
      if (!personById(e.personId)) throw new HttpError(404, 'Pessoa não encontrada');
      if (seen.has(e.personId)) throw new HttpError(400, 'Pessoa repetida');
      seen.add(e.personId);
    });
    if (parts.some((p) => p <= 0)) throw new HttpError(400, 'Parte zerada');
    if (parts.reduce((a, p) => a + p, 0) > total) throw new HttpError(400, 'As partes passam do valor da transação');
    return parts;
  }

  async function route(method, url, payload) {
    let m;
    if (method === 'GET' && url === '/people') {
      const includeInactive = payload?.includeInactive === true;
      return { status: 200, body: { success: true, data: clone(state.people.filter((p) => includeInactive || p.isActive)) } };
    }
    if (method === 'GET' && url === '/people/balances') {
      const rows = state.people.map(balanceOf).filter((b) => b.person.isActive || b.balance !== 0);
      return { status: 200, body: { success: true, data: rows } };
    }
    if (method === 'POST' && url === '/people') {
      const taken = (name) => state.people.some((p) => norm(p.name) === norm(name) || p.aliases.some((a) => norm(a) === norm(name)));
      if (taken(payload.name) || (payload.aliases ?? []).some(taken)) throw new HttpError(409, 'Nome ou apelido repetido');
      const person = { id: nextId('p-new-'), householdId: payload.householdId, name: payload.name, aliases: payload.aliases ?? [], userId: null, isActive: true };
      state.people.push(person);
      return { status: 201, body: { success: true, data: clone(person) } };
    }
    if ((m = /^\/people\/([^/]+)$/.exec(url)) && method === 'PATCH') {
      const person = personById(m[1]);
      if (!person) throw new HttpError(404, 'Pessoa não encontrada');
      Object.assign(person, payload);
      return { status: 200, body: { success: true, data: clone(person) } };
    }
    if ((m = /^\/people\/([^/]+)$/.exec(url)) && method === 'DELETE') {
      const person = personById(m[1]);
      if (!person) throw new HttpError(404, 'Pessoa não encontrada');
      const hasData = state.shares.some((s) => s.personId === person.id) || state.settlements.some((s) => s.personId === person.id);
      if (!hasData) {
        state.people = state.people.filter((p) => p.id !== person.id);
        return { status: 204, body: undefined };
      }
      person.isActive = false;
      return { status: 200, body: { success: true, data: clone(person) } };
    }
    if ((m = /^\/people\/([^/]+)\/ledger$/.exec(url)) && method === 'GET') {
      const person = personById(m[1]);
      if (!person) throw new HttpError(404, 'Pessoa não encontrada');
      // Like the server: newest first unless order=asc; the running balance is chronological either way.
      const chronological = ledgerOf(person);
      const all = payload?.order === 'asc' ? chronological : [...chronological].reverse();
      const offset = payload?.cursor ? Number(String(payload.cursor).slice(1)) : 0;
      const limit = payload?.limit ?? 25;
      const slice = all.slice(offset, offset + limit);
      const hasMore = offset + limit < all.length;
      return { status: 200, body: { success: true, data: slice, pagination: { nextCursor: hasMore ? `c${offset + limit}` : null, hasMore, total: all.length } } };
    }
    if ((m = /^\/people\/([^/]+)\/settlements$/.exec(url)) && method === 'GET') {
      return { status: 200, body: { success: true, data: clone(state.settlements.filter((s) => s.personId === m[1]).map((s) => ({ ...s, amount: reais(s.amount) }))) } };
    }
    if ((m = /^\/people\/([^/]+)\/settlements$/.exec(url)) && method === 'POST') {
      const person = personById(m[1]);
      if (!person) throw new HttpError(404, 'Pessoa não encontrada');
      let transactionId = null;
      if (payload.transactionId) {
        const tx = txById(payload.transactionId);
        if (!tx) throw new HttpError(404, 'Transação não encontrada');
        if (state.settlements.some((s) => s.transactionId === tx.id)) throw new HttpError(409, 'A transação já está ligada a outro acerto');
        transactionId = tx.id;
      }
      if (payload.createTransaction) {
        const tx = {
          id: nextId('tx-settle-'), description: payload.createTransaction.description ?? `Acerto ${person.name}`, amount: payload.amount,
          type: payload.direction === 'RECEIVED' ? 'INCOME' : 'EXPENSE', date: payload.date, accountId: payload.createTransaction.accountId,
        };
        state.transactions.push(tx);
        transactionId = tx.id;
      }
      const settlement = { id: nextId('st-'), seq: state.seq, personId: person.id, direction: payload.direction, amount: cents(payload.amount), date: payload.date, transactionId, note: payload.note ?? null };
      state.settlements.push(settlement);
      return { status: 201, body: { success: true, data: { ...settlement, amount: payload.amount } } };
    }
    if ((m = /^\/settlements\/([^/]+)$/.exec(url)) && method === 'DELETE') {
      const before = state.settlements.length;
      state.settlements = state.settlements.filter((s) => s.id !== m[1]);
      if (state.settlements.length === before) throw new HttpError(404, 'Acerto não encontrado');
      return { status: 204, body: undefined };
    }
    if ((m = /^\/transactions\/([^/]+)\/shares$/.exec(url))) {
      const tx = txById(m[1]);
      if (!tx) throw new HttpError(404, 'Transação não encontrada');
      if (method === 'GET') return { status: 200, body: { success: true, data: sharesResponse(tx) } };
      if (method === 'PUT') {
        const parts = validateShares(tx, payload);
        state.shares = state.shares.filter((s) => !(s.transactionId === tx.id && s.direction === payload.direction));
        payload.entries.forEach((e, i) => {
          state.shares.push({ id: nextId('sh-'), seq: state.seq, transactionId: tx.id, personId: e.personId, direction: payload.direction, amount: parts[i], note: e.note ?? null, source: 'manual' });
        });
        return { status: 200, body: { success: true, data: sharesResponse(tx) } };
      }
    }
    if ((m = /^\/transactions\/([^/]+)\/shares\/preview$/.exec(url)) && method === 'POST') {
      const tx = txById(m[1]);
      if (!tx) throw new HttpError(404, 'Transação não encontrada');
      const parts = validateShares(tx, payload);
      const sum = parts.reduce((a, p) => a + p, 0);
      return { status: 200, body: { success: true, data: { shares: payload.entries.map((e, i) => ({ personId: e.personId, amount: reais(parts[i]) })), myPart: reais(cents(tx.amount) - sum) } } };
    }
    if (method === 'POST' && url === '/people/organize/preview') {
      assert.ok(state.organizePreview, 'organizePreview not programmed');
      return { status: 200, body: { success: true, data: clone(typeof state.organizePreview === 'function' ? state.organizePreview(payload) : state.organizePreview) } };
    }
    if (method === 'POST' && url === '/people/organize/apply') {
      assert.ok(state.organizeApply, 'organizeApply not programmed');
      const data = await state.organizeApply(payload);
      return { status: 201, body: { success: true, data } };
    }
    throw new HttpError(404, `Rota desconhecida: ${method} ${url}`);
  }

  return {
    state,
    /** Handler installed as `fake.people`. */
    async handle(method, url, payload) {
      const gate = gates.find((g) => !g.used && g.match(method, url, payload));
      if (gate) {
        gate.used = true;
        await gate.promise;
      }
      const hit = intercepts.find((i) => i.match(method, url, payload) && (i.times === undefined || i.times > 0));
      if (hit) {
        if (hit.times !== undefined) hit.times -= 1;
        if (hit.error) throw hit.error;
        if (hit.respond) return hit.respond(method, url, payload);
      }
      return route(method, url, payload);
    },
    /** The next `times` requests matching answer with `error` (a status-bearing Error). */
    failNext(match, error, times = 1) { intercepts.push({ match, error, times }); },
    /** The next `times` requests matching are answered by `respond(method, url, payload)` -> { status, body }. */
    override(match, respond, times = 1) { intercepts.push({ match, respond, times }); },
    /** Holds the first request matching until the returned gate is released or failed. */
    gate(match) {
      let release; let fail;
      const gate = { match, used: false, promise: new Promise((res, rej) => { release = res; fail = rej; }) };
      gate.promise.catch(() => {});
      gate.ok = () => release();
      gate.fail = (e) => fail(e);
      gates.push(gate);
      return gate;
    },
    addShare(txId, personId, amountReais, direction = 'THEY_OWE_ME', o = {}) {
      state.shares.push({ id: nextId('sh-'), seq: state.seq, transactionId: txId, personId, direction, amount: cents(amountReais), note: o.note ?? null, source: o.source ?? 'manual' });
    },
    addSettlement(personId, amountReais, date, direction = 'RECEIVED') {
      state.settlements.push({ id: nextId('st-'), seq: state.seq, personId, direction, amount: cents(amountReais), date, transactionId: null, note: null });
    },
    balanceOf: (id) => balanceOf(personById(id)),
    sharesOf: (txId) => sharesResponse(txById(txId)),
  };
}
