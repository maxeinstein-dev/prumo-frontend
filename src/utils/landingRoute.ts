/**
 * Where "/" sends the visitor. Signed in: the app. Inside the Android app without a session: the login (the landing
 * page is a marketing page, not a screen of the app). On the site: null, the landing page itself.
 * Covered by tests/t71_public_safe_area.mts.
 */
export function publicHomeTarget({ signedIn, native }: { signedIn: boolean; native: boolean }): '/app' | '/login' | null {
  if (signedIn) return '/app';
  if (native) return '/login';
  return null;
}
