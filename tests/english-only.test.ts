import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localizedPath } from '../src/lib/locale-path';
import { resolveAfterAuthUrl, safeInternalPath } from '../src/lib/redirect';
import { m } from '../src/paraglide/messages.js';
import { baseLocale, getLocale, locales } from '../src/paraglide/runtime.js';

test('only the base locale is enabled and messages resolve', () => {
  assert.deepEqual([...locales], [baseLocale]);
  assert.equal(baseLocale, 'en');
  assert.equal(getLocale(), baseLocale);
  assert.equal(typeof m['common.sign.sign_in_title'], 'function');
});

test('localizedPath falls back to the base locale for unknown locales', () => {
  assert.equal(localizedPath('/pricing', 'unknown'), '/pricing');
  assert.equal(localizedPath('/pricing', 'en'), '/pricing');
});

test('after-auth redirects never leave the app origin', () => {
  assert.equal(
    resolveAfterAuthUrl({ redirect: 'https://evil.example/x' }),
    '/settings'
  );
  assert.equal(
    resolveAfterAuthUrl({ redirect: '/billing?tab=1' }),
    '/billing?tab=1'
  );
  assert.equal(safeInternalPath('//evil.example'), null);
});
