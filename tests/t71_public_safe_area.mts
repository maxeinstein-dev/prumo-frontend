import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// The Android app draws edge to edge (Android 15+): a page must keep its own top clear of the status bar. On the first
// opening the public landing page put the logo and "Entrar" under the clock and the icons. Inside the app the landing page
// (a marketing page) is skipped: "/" goes to the login.
const read = (rel: string): string => readFileSync(frontSrc(rel), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const R: any = await import(pathToFileURL(frontSrc('utils/landingRoute.ts')).href);

console.log('\n[public pages + status bar] utils/landingRoute.ts, LandingPage.tsx, Login.tsx');

check('publicHomeTarget: signed in goes to /app; the app without a session goes to /login; the site shows the landing page', () => {
  assert.equal(R.publicHomeTarget({ signedIn: true, native: false }), '/app');
  assert.equal(R.publicHomeTarget({ signedIn: true, native: true }), '/app');
  assert.equal(R.publicHomeTarget({ signedIn: false, native: true }), '/login');
  assert.equal(R.publicHomeTarget({ signedIn: false, native: false }), null);
});

check('App.tsx: the "/" route asks publicHomeTarget with isNativeApp()', () => {
  const app = read('App.tsx');
  assert.ok(app.includes('publicHomeTarget('), 'LandingRoute uses publicHomeTarget');
  assert.ok(app.includes('isNativeApp()'), 'native comes from native/captureReader');
});

check('LandingPage: the sticky nav stays below the status bar and the theme button above the gesture bar', () => {
  const src = read('pages/LandingPage.tsx');
  const nav = /<nav[^>]*>/.exec(src)?.[0] ?? '';
  assert.ok(nav.includes('env(safe-area-inset-top'), 'nav pads the top inset: ' + nav);
  const start = src.lastIndexOf('<button', src.indexOf('logLandingThemeToggled'));
  const tag = src.slice(start, src.indexOf('aria-label="Toggle theme"', start)); // the onClick arrow has a '>'
  assert.ok(tag.includes('env(safe-area-inset-bottom'), 'theme button clears the bottom inset: ' + tag.slice(0, 200));
});

check('Login: the page keeps both insets clear (status bar and gesture bar)', () => {
  const src = read('pages/Login.tsx');
  const root = /<div className="min-h-screen[^>]*>/.exec(src)?.[0] ?? '';
  assert.ok(root.includes('env(safe-area-inset-top'), 'top inset: ' + root);
  assert.ok(root.includes('env(safe-area-inset-bottom'), 'bottom inset: ' + root);
});
