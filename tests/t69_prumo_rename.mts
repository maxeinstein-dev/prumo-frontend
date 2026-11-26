import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// R9: o produto passa de Recta para Prumo.
// 1. utils/storageRename.ts move as chaves guardadas no navegador (recta_* e recta.*) para o nome novo,
//    sem deslogar ninguém nem perder preferência. PRUMO_RENAME_MODULE aponta para uma cópia alterada (sabotagem).
// 2. Guarda: nenhum "Recta" visível nas telas, nos idiomas, no index.html nem em public/.
const modPath = process.env.PRUMO_RENAME_MODULE || frontSrc('utils/storageRename.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const R: any = await import(pathToFileURL(modPath).href);

/** Storage em memória com a mesma interface do localStorage. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}
const dump = (s: Storage): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < s.length; i++) { const k = s.key(i)!; out[k] = s.getItem(k)!; }
  return out;
};

console.log('\n[R9 Prumo] utils/storageRename.ts e guarda de textos');

check('renameKey: recta_ and recta. prefixes map to prumo; other keys are left alone', () => {
  assert.equal(R.renamedKey('recta_token'), 'prumo_token');
  assert.equal(R.renamedKey('recta_user'), 'prumo_user');
  assert.equal(R.renamedKey('recta_auth_mode'), 'prumo_auth_mode');
  assert.equal(R.renamedKey('recta.addSheet.recent.h1.EXPENSE.cat'), 'prumo.addSheet.recent.h1.EXPENSE.cat');
  assert.equal(R.renamedKey('theme'), null);
  assert.equal(R.renamedKey('rectangle'), null);
  assert.equal(R.renamedKey('prumo_token'), null);
});

check('renameStoredKeys: the session and preferences move to the new keys and the old ones go away', () => {
  const s = memoryStorage({
    recta_token: 'jwt-abc',
    recta_user: '{"id":"u1"}',
    'recta.people.settlementAccount': '{"h1":"acc1"}',
    theme: 'dark',
  });
  R.renameStoredKeys(s);
  assert.deepEqual(dump(s), {
    prumo_token: 'jwt-abc',
    prumo_user: '{"id":"u1"}',
    'prumo.people.settlementAccount': '{"h1":"acc1"}',
    theme: 'dark',
  });
});

check('renameStoredKeys: a value already under the new key wins (newer), the old one is dropped', () => {
  const s = memoryStorage({ recta_token: 'old', prumo_token: 'new' });
  R.renameStoredKeys(s);
  assert.deepEqual(dump(s), { prumo_token: 'new' });
});

check('renameStoredKeys: running twice changes nothing the second time', () => {
  const s = memoryStorage({ recta_token: 't', 'recta.quickSplit.lastPerson': 'p1' });
  R.renameStoredKeys(s);
  const once = dump(s);
  R.renameStoredKeys(s);
  assert.deepEqual(dump(s), once);
});

check('renameStoredKeys: a storage that throws (private mode) never breaks the page', () => {
  const broken = {
    get length(): number { throw new Error('denied'); },
    key() { throw new Error('denied'); },
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
    clear() { throw new Error('denied'); },
  } as unknown as Storage;
  assert.doesNotThrow(() => R.renameStoredKeys(broken));
  assert.doesNotThrow(() => R.renameStoredKeys(null));
});

// ---- Guarda de textos ------------------------------------------------------------------------------------------
const srcDir = dirname(frontSrc('main.tsx'));
const root = dirname(srcDir);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// O que fica de fora de propósito, com o motivo:
// - storageRename.ts: guarda os nomes antigos para migrar.
// - __rectaNativeBack: ponte com o MainActivity do APK instalado; troca no lote do APK, junto com o código Android.
// - recta.app, recta-backend-app (CSP), r/RectaApp, recta-selfhosted, recta-public: endereços do projeto original.
// - "Recta/tools": caminho da pasta no disco citado em comentários.
const ALLOWED_FILES = new Set(['src/utils/storageRename.ts']);
const ALLOWED_TEXT = [/__rectaNativeBack/g, /recta-backend-app/g, /recta\.app/g, /r\/RectaApp/g, /recta-selfhosted/g, /recta-public/g, /Recta\/tools/g];

/**
 * "recta" como nome: no começo de palavra (Recta, recta_token, rectaCents) ou como parte de camelCase (ResetRecta).
 * Não conta "correcta"/"directa" (espanhol, minúsculo no meio da palavra) nem "rectangle".
 */
export function mentionsRecta(line: string): boolean {
  for (const m of line.matchAll(/recta/gi)) {
    const at = m.index!;
    if (/^ngle/i.test(line.slice(at + 5))) continue;
    const before = at === 0 ? '' : line[at - 1];
    if (!/[a-zA-Z]/.test(before) || m[0][0] === 'R') return true;
  }
  return false;
}

check('mentionsRecta: finds the name and identifiers, skips Spanish words and rectangle', () => {
  for (const yes of ['O Recta lê', 'recta_token', "'recta.maxfin'", 'rectaCents', 'handleResetRectaAccount', 'RECTA_TOTAL']) {
    assert.equal(mentionsRecta(yes), true, yes);
  }
  for (const no of ['es correcta', 'línea directa', 'rectangle', 'Rectangle', 'prumo_token']) {
    assert.equal(mentionsRecta(no), false, no);
  }
});

const files = [
  ...walk(srcDir).filter((p) => /\.(tsx?|json|css|html)$/.test(p)),
  ...walk(join(root, 'public')).filter((p) => /\.(html|json|webmanifest|txt|xml|js)$/.test(p)),
  join(root, 'index.html'),
];

check('guard: no "Recta" left in screens, languages, index.html or public/ (case-insensitive, outside the allowed list)', () => {
  const hits: string[] = [];
  for (const file of files) {
    const rel = relative(root, file).split('\\').join('/');
    if (ALLOWED_FILES.has(rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      let clean = line;
      for (const re of ALLOWED_TEXT) clean = clean.replace(re, '');
      if (mentionsRecta(clean)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.equal(hits.length, 0, `${hits.length} linhas ainda com Recta:\n${hits.slice(0, 25).join('\n')}`);
});
