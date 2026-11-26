// Fake of utils/api for the category simulation (category-sim.mjs): every call goes to `globalThis.__catServer(method, url, payload)`,
// which answers the response envelope or throws an Error carrying `status` and `code` (what the real client throws).
const g = globalThis as any;
const call = (method: string, url: string, payload?: unknown) => {
  g.__catCalls.push({ method, url, payload });
  return g.__catServer(method, url, payload);
};
export const apiClient = {
  get: (url: string, params?: unknown) => call('GET', url, params),
  post: (url: string, payload?: unknown) => call('POST', url, payload),
  patch: (url: string, payload?: unknown) => call('PATCH', url, payload),
  put: (url: string, payload?: unknown) => call('PUT', url, payload),
  delete: (url: string) => call('DELETE', url),
};
export interface ApiResponse<T> { data?: T }
