const g = globalThis as any;
g.__toasts ??= [];
const api = {
  success: (m: string) => g.__toasts.push(['success', m]),
  error: (m: string) => g.__toasts.push(['error', m]),
  showToast: (m: string, kind?: string) => g.__toasts.push([kind ?? 'info', m]),
};
export const useToastContext = () => api;
