// Controllable fake of utils/api: no network. The scenarios program `globalThis.__fake`.
type Handler = (...args: any[]) => Promise<any>;
const g = globalThis as any;
g.__fake ??= {
  preview: null as Handler | null, workbook: null as Handler | null, confirm: null as Handler | null,
  cardPreview: null as Handler | null, cardConfirm: null as Handler | null, statementPreview: null as Handler | null,
  // Phase 4 (people): `people(method, url, payload)` resolves { status, body } (body = the response envelope).
  people: null as Handler | null,
  // Phase 5 (recurring detection): `recurring(method, url, payload)` resolves the response envelope ({ success, data }).
  recurring: null as Handler | null,
  // Gap C (review queue of a card): `review(method, url, payloadOrParams)` resolves the response envelope ({ success, data }).
  review: null as Handler | null,
  calls: [] as any[],
};
// Phase 4 routes: /people..., /transactions/:id/shares..., /settlements/...
const isPeopleUrl = (url: string) => url.startsWith('/people') || /^\/transactions\/[^/]+\/shares/.test(url) || url.startsWith('/settlements');
const people = async (method: string, url: string, payload?: unknown) => {
  g.__fake.calls.push({ kind: 'people', method, url, payload });
  return g.__fake.people(method, url, payload);
};
export const axiosInstance = {
  post: (url: string, body: unknown, cfg: unknown) => {
    // The workbook (.xlsx) preview has its own handler and call kind; the monthly (.csv) preview keeps 'preview'.
    if (url.includes('/maxfin/workbook/')) {
      g.__fake.calls.push({ kind: 'workbook', url, body, cfg });
      return g.__fake.workbook(url, body, cfg);
    }
    // Phase 3: the card invoice (.ofx) preview, and the generic statement preview it must replace for cards.
    if (url.includes('/card-ofx/')) {
      g.__fake.calls.push({ kind: 'card-preview', url, body, cfg });
      return g.__fake.cardPreview(url, body, cfg);
    }
    if (url === '/transactions/import/preview') {
      g.__fake.calls.push({ kind: 'statement-preview', url, body, cfg });
      return g.__fake.statementPreview(url, body, cfg);
    }
    g.__fake.calls.push({ kind: 'preview', url, body, cfg });
    return g.__fake.preview(url, body, cfg);
  },
  // The raw delete keeps the status (DELETE /people/:id answers 204 or 200).
  delete: async (url: string) => {
    const { status, body } = await people('DELETE', url);
    return { status, data: body };
  },
};
export const apiClient = {
  get: async (url: string, params?: unknown) => {
    if (url.startsWith('/transactions/import/card-ofx/review-queue')) {
      g.__fake.calls.push({ kind: 'review', method: 'GET', url, payload: params });
      return g.__fake.review('GET', url, params);
    }
    return (await people('GET', url, params)).body;
  },
  put: async (url: string, payload?: unknown) => (await people('PUT', url, payload)).body,
  patch: async (url: string, payload?: unknown) => (await people('PATCH', url, payload)).body,
  delete: async (url: string) => {
    const { status, body } = await people('DELETE', url);
    return status === 204 ? { success: true } : body;
  },
  post: async (url: string, payload: unknown, cfg?: unknown) => {
    // "Ajustar saldo": POST /accounts/:id/adjust-balance answers the envelope { success, data: { account, adjustment } }.
    if (/^\/accounts\/[^/]+\/adjust-balance$/.test(url)) {
      g.__fake.calls.push({ kind: 'adjust', url, payload });
      return g.__fake.adjust(url, payload);
    }
    if (isPeopleUrl(url)) return (await people('POST', url, payload)).body;
    if (url.startsWith('/recurring-transactions/detect')) {
      g.__fake.calls.push({ kind: 'recurring', method: 'POST', url, payload });
      return g.__fake.recurring('POST', url, payload);
    }
    if (url.startsWith('/transactions/import/card-ofx/review-queue')) {
      g.__fake.calls.push({ kind: 'review', method: 'POST', url, payload });
      return g.__fake.review('POST', url, payload);
    }
    if (url.includes('/card-ofx/')) {
      g.__fake.calls.push({ kind: 'card-confirm', url, payload });
      return g.__fake.cardConfirm(url, payload);
    }
    g.__fake.calls.push({ kind: 'confirm', url, payload, cfg });
    return g.__fake.confirm(url, payload);
  },
};
export interface ApiResponse<T> { data?: T }
