// The People page only reads `t.peoplePage` (with a Portuguese fallback) and PageHeader `t.moreOptions`.
// A scenario may put the real translations of a locale in `globalThis.__translations`.
export const useI18n = () => ({ t: ((globalThis as any).__translations ?? {}) as Record<string, string>, locale: 'pt-BR' });
