/**
 * The product was renamed from Recta to Prumo (R9). Keys saved in the browser under the old prefixes
 * (`recta_token`, `recta_user`, `recta.addSheet.recent...`) move to the new ones once, before anything reads them,
 * so nobody is logged out and no preference is lost. Pure: covered by Recta/tools/fe-tests/t69_prumo_rename.mts.
 */

const OLD_PREFIXES: ReadonlyArray<[string, string]> = [
  ['recta_', 'prumo_'],
  ['recta.', 'prumo.'],
];

/** The new name of a key saved under an old prefix, or null when the key is not one of them. */
export function renamedKey(key: string): string | null {
  for (const [from, to] of OLD_PREFIXES) {
    if (key.startsWith(from)) return to + key.slice(from.length);
  }
  return null;
}

/**
 * Moves every old key to its new name. A value already under the new name is newer and wins; the old key is removed
 * either way. Running it again does nothing. A storage that throws (private mode, blocked) is left as it is.
 */
export function renameStoredKeys(storage: Storage | null): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) keys.push(key);
    }
    for (const key of keys) {
      const target = renamedKey(key);
      if (target === null) continue;
      const value = storage.getItem(key);
      if (value !== null && storage.getItem(target) === null) storage.setItem(target, value);
      storage.removeItem(key);
    }
  } catch {
    // Storage unavailable: nothing to move.
  }
}

/** The browser's localStorage, or null when it cannot be reached. */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
