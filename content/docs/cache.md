---
title: Cache
description: Creating and binding Cloudflare KV, plus the cache API
locale: en
order: 8
group: deploy
updated: 2026-10-21
---

Server-side caching uses **Cloudflare KV** through the `CACHE` binding. Code is in
`src/cache/`.

It fits read-heavy, write-light data where brief staleness is acceptable: third-party
status lookups, public lists, slow endpoints. It does not fit data that needs strong
consistency or frequent writes — KV propagation is eventually consistent.

## Prerequisites

The token needs **Account → Workers KV Storage → Edit**, see [Cloudflare](./cloudflare).

## Setup

### 1. Create a namespace

```bash
pnpm exec wrangler kv namespace create saas-template-cache
```

Copy the `id` into `wrangler.jsonc`:

```jsonc title="wrangler.jsonc"
{
  "kv_namespaces": [{ "binding": "CACHE", "id": "42041d2cc3e84a378f3e264591790a3b" }]
}
```

`binding` is the name code reads (`env.CACHE`) and must match `src/types/cloudflare.d.ts`.

> The namespace name (`saas-template-cache`) and the binding name (`CACHE`) are separate on
> purpose: the former identifies the resource in Cloudflare, the latter is the variable name
> in code. Deploying the same code to several accounts only requires repointing the id.

### 2. No extra switch

Caching is always on; there is no `enabled` flag. Without an ALS context (as in tests) each
function degrades to pass-through — it calls the fetcher directly, caching nothing and
raising nothing.

## Usage

```ts
import { CACHE_TTL, createCacheKey, deleteCache, deleteCacheByPrefix, getOrSetCache } from '@/cache'
```

### Read-through

```ts
const status = await getOrSetCache({
  key: createCacheKey('newsletter:status', email),
  ttlSeconds: CACHE_TTL.newsletterStatus,
  fetcher: async () => fetchStatusFromProvider(email),
})
```

A hit returns the cached value; a miss calls `fetcher`, writes KV, and returns the result.

### Invalidate

```ts
await deleteCache(createCacheKey('newsletter:status', email))   // single key
await deleteCacheByPrefix(createCacheKey('products:list'))      // prefix
```

Invalidate after writes rather than waiting for the TTL.

### Building keys

Always go through `createCacheKey()`, never concatenate by hand:

```ts
createCacheKey('newsletter:status', 'someone@example.com')
// → 'newsletter:status:someone@example.com'
```

It replaces `:` inside segments with `_` so a colon in a parameter cannot pollute the key
hierarchy and cause a prefix invalidation to delete the wrong entries.

### TTL constants

Centralized in `src/cache/constants.ts`; no magic numbers at call sites.

| Constant | Seconds | Purpose |
|---|---|---|
| `CACHE_TTL.newsletterStatus` | 3600 | Subscription status |
| `CACHE_TTL.providerStatus` | 300 | Third-party provider status |
| `CACHE_TTL.publicList` | 60 | Public lists |

### Existing consumers

| Location | Purpose |
|---|---|
| `src/newsletter/index.ts` | Caches subscription status, invalidates after writes |
| `src/lib/rate-limit.ts` | Builds rate-limit keys |

Rate limiting and caching share the `CACHE` binding.

## Commands

| Command | Purpose |
|---|---|
| `pnpm exec wrangler kv namespace create <name>` | Create a namespace |
| `pnpm exec wrangler kv namespace list` | List namespaces |
| `pnpm exec wrangler kv key list --namespace-id <id>` | List keys |

## References

- [Cloudflare Workers KV](https://developers.cloudflare.com/kv/)
- [KV quick start](https://developers.cloudflare.com/kv/get-started/)
- [KV limits](https://developers.cloudflare.com/kv/platform/limits/)

## Next steps

- [Integrations](./integrations) — which modules use the cache
- [Newsletter](./newsletter) — the consumer of `CACHE_TTL.newsletterStatus`
- [Database](./database) — use D1 when you need strong consistency
