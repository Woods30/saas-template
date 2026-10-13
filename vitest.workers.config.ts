import { cloudflarePool } from '@cloudflare/vitest-pool-workers';

export default {
  test: {
    name: 'workers',
    pool: cloudflarePool({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        compatibilityDate: '2026-10-01',
        compatibilityFlags: ['nodejs_compat'],
      },
    }),
    include: ['tests/workers/**/*.test.ts'],
  },
};
