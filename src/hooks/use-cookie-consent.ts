import { useSyncExternalStore } from 'react';

import {
  type CookieConsent,
  readCookieConsent,
  subscribeCookieConsent,
} from '@/lib/cookie-consent';

// The visitor's cookie choice. `initial` is the value the server read from the
// request cookie, so SSR and hydration render the same thing.
export function useCookieConsent(initial: CookieConsent): CookieConsent {
  return useSyncExternalStore(
    subscribeCookieConsent,
    readCookieConsent,
    () => initial
  );
}
