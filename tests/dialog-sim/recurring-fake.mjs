// Phase 5: a small stateful fake of POST /recurring-transactions/detect and /detect/apply (the HTTP contract of the spec,
// not the real backend). The apply is computed here, independently of the client: it creates a recurrence per known id,
// applies the adjustments it receives and counts the ids that do not exist any more as skipped. Invented data only.
const clone = (v) => JSON.parse(JSON.stringify(v));

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const EMPTY_SKIPPED = { alreadyRecurring: 0, installments: 0, sparse: 0, consumption: 0 };

export function createRecurringServer({ candidates = [], skipped = EMPTY_SKIPPED } = {}) {
  const state = { candidates: clone(candidates), skipped: clone(skipped), created: [], seq: 0, linked: 0 };
  const holds = { detect: [], apply: [] };
  const fails = { detect: [], apply: [] };

  const kindOf = (url) => (url.endsWith('/detect/apply') ? 'apply' : 'detect');

  return {
    state,
    /** The next request of the kind waits until the returned handle is released; `release(body?)` may supply the answer. */
    hold(kind) {
      let resolve;
      const promise = new Promise((res) => { resolve = res; });
      const handle = { promise, release: (data) => resolve({ data }), fail: (error) => resolve({ error }) };
      holds[kind].push(handle);
      return handle;
    },
    /** The next request of the kind fails with an Error carrying `status`. */
    failNext(kind, status, message) { fails[kind].push(new HttpError(status, message)); },
    async handle(method, url, payload) {
      const kind = kindOf(url);
      const held = holds[kind].shift();
      let supplied;
      if (held) {
        const answer = await held.promise;
        if (answer.error) throw answer.error;
        supplied = answer.data;
      }
      const failure = fails[kind].shift();
      if (failure) throw failure;
      if (kind === 'detect') {
        const data = supplied ?? { candidates: clone(state.candidates), skipped: clone(state.skipped) };
        return { success: true, data };
      }
      if (supplied) return { success: true, data: supplied };
      let created = 0;
      let skippedCount = 0;
      let linkedTransactions = 0;
      for (const item of payload.items) {
        const candidate = state.candidates.find((c) => c.id === item.id);
        if (!candidate) { skippedCount += 1; continue; }
        state.seq += 1;
        state.created.push({
          id: `rec-${state.seq}`, candidateId: candidate.id, description: item.description ?? candidate.description,
          amount: item.amount ?? candidate.amount, dayOfMonth: item.dayOfMonth ?? candidate.dayOfMonth,
          followLastAmount: item.followLastAmount ?? (candidate.followLastAmount !== false),
        });
        created += 1;
        linkedTransactions += candidate.examples.length;
      }
      state.linked += linkedTransactions;
      return { success: true, data: { created, skipped: skippedCount, linkedTransactions, warnings: [] } };
    },
  };
}
