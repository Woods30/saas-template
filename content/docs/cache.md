---
title: Cache
description: Creating, binding, and using the Cloudflare KV cache
locale: en
order: 8
group: deploy
updated: 2026-11-03
---

Server-side caching uses **Cloudflare KV** through the `CACHE` binding. The code is in `src/core/cache/`.

It fits read-heavy, write-light data where brief staleness is acceptable: third-party status lookups, public lists, slow endpoints. It does not fit data that needs strong consistency or frequent writes — KV writes propagate with a delay.

## Steps

1. **Create a namespace.**

   ```bash
   pnpm exec wrangler kv namespace create <your-namespace-name>
   ```

   Copy the `id` from the output into `wrangler.jsonc`:

   ```jsonc title="wrangler.jsonc"
   {
     "kv_namespaces": [{ "binding": "CACHE", "id": "<your-namespace-id>" }]
   }
   ```

   The `binding` is the name code reads (`env.CACHE`) and must match `src/types/cloudflare.d.ts`. The namespace name and the binding name are separate on purpose: the former identifies the resource in Cloudflare, the latter is the variable name in code.

2. **No extra switch.** Caching is always on and there is no `enabled` option. Outside a request context (in tests, for example) every function degrades to pass-through: it calls the fetcher and neither caches nor throws.

## Usage

```ts
import { CACHE_TTL, createCacheKey, deleteCache, deleteCacheByPrefix, getOrSetCache } from '@/cache'

// Read: a hit returns immediately, a miss calls the fetcher, writes KV, and returns
const status = await getOrSetCache({
  key: createCacheKey('newsletter:status', email),
  ttlSeconds: CACHE_TTL.newsletterStatus,
  fetcher: async () => fetchStatusFromProvider(email),
})

// Invalidate
await deleteCache(createCacheKey('newsletter:status', email))   // single key
await deleteCacheByPrefix(createCacheKey('products', 'list'))    // by prefix
```

**Always build keys with `createCacheKey()`**: it replaces `:` inside each part with `_` and joins the parts with `:`, so a colon in an argument cannot pollute the key levels and cause a prefix invalidation to delete the wrong entries. Use the TTL constants from `src/core/cache/constants.ts` instead of writing numbers at the call site:

| Constant | Seconds | Used for |
|---|---|---|
| `CACHE_TTL.newsletterStatus` | 3600 | Subscription status |
| `CACHE_TTL.priceCatalog` | 60 | Payment price catalog, so a price change shows up within a minute |
| `CACHE_TTL.providerStatus` | 300 | Third-party provider status |
| `CACHE_TTL.publicList` | 60 | Public lists |

Only `newsletterStatus` and `priceCatalog` have callers today; the other two are ready to use. Invalidate the affected key right after a write instead of waiting for the TTL to expire.

## Current consumers

| Location | Purpose |
|---|---|
| `src/modules/newsletter/index.ts` | Caches subscription status, invalidated after subscribe and unsubscribe |
| `src/lib/rate-limit.ts` | Builds rate limit keys with `createCacheKey` |
| `src/core/payment/price-catalog.server.ts` | Caches the payment price catalog |

Rate limiting and caching share the same `CACHE` namespace.

## Common commands

| Command | What it does |
|---|---|
| `pnpm exec wrangler kv namespace create <name>` | Create a namespace |
| `pnpm exec wrangler kv namespace list` | List namespaces |
| `pnpm exec wrangler kv key list --namespace-id <id>` | List keys |

Once this is wired up you can move on to [File Storage](./storage).
