---
title: Storage
description: Creating and binding Cloudflare R2, plus the file API
locale: en
order: 7
group: deploy
updated: 2026-10-21
---

Files live in **Cloudflare R2**, accessed through the `BUCKET` binding, with zero egress
fees. Code is in `src/storage/`.

> **The storage module is implemented but not wired up**: `features.enableFileUpload` is
> `false` by default and no route uses it. This page covers what to do when you need it —
> R2 not being enabled does not affect the template.

## Prerequisites

The token needs **Account → Workers R2 Storage → Edit**, see [Cloudflare](./cloudflare).

## Setup

### 1. Enable R2 in the Dashboard

**This cannot be skipped and cannot be done via API.** R2 must be activated once:

> Dashboard → **R2** → follow the prompt

A payment method is required (the free tier covers 10 GB storage and 1M Class A
operations per month).

Without it the API rejects requests:

```
[code: 10042] Please enable R2 through the Cloudflare Dashboard.
```

### 2. Create a bucket

```bash
pnpm exec wrangler r2 bucket create saas-template-uploads
```

### 3. Add the binding

```jsonc title="wrangler.jsonc"
{
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "saas-template-uploads" }]
}
```

`binding` is the name code reads (`env.BUCKET`) and must match `src/types/cloudflare.d.ts`.

> The block is **commented out** by default because R2 needs Dashboard activation. Uncomment
> it and redeploy once enabled. Without the binding `env.BUCKET` is `undefined` and
> `getStorageProvider()` throws — the expected degraded behavior.

### 4. Enable uploads

```ts
// src/config/website.ts
features: {
  enableFileUpload: true,
}
```

Rebuild and redeploy.

## Usage

Import from `@/storage`; each function resolves the provider from AsyncLocalStorage:

```ts
import { uploadFile, deleteFile, downloadFile, getFileInfo, listUserFiles } from '@/storage'
```

### Upload

```ts
const result = await uploadFile(fileArrayBuffer, 'photo.png', 'image/png', {
  folder: 'uploads',        // allowlist: uploads / avatars / documents
  userId: 'user_abc',       // optional, becomes part of the key
  visibility: 'private',    // 'private' (default) | 'public'
})
// → { key, url, metadata }
```

The key looks like `uploads/user_abc/1729000000000-photo.png`.

### Delete and download

Neither method checks ownership — callers must verify the key belongs to the current user:

```ts
await deleteFile(key, true)      // second arg true = authorization confirmed
await downloadFile(key, true)    // required for private objects
```

Omitting `authorized` throws. That is deliberate: it prevents forgetting the check.

### Inspect

```ts
const info = await getFileInfo(key)          // { key, size, contentType, uploadedAt } | null
const { files, cursor } = await listUserFiles(userId)
```

## Security notes

`buildKey` sanitizes user input: strips `/`, `\`, `..`, and leading `.`, replaces other
unsafe characters with `_`; `folder` only accepts allowlisted values; the assembled key is
then asserted to start with an allowlisted prefix.

> **Authorization is not part of the storage layer.** `deleteFile` / `downloadFile` only
> honor the `authorized` boolean and never query ownership. Any upload route must verify
> the session and ownership first, or any signed-in user can delete someone else's files.

## Commands

| Command | Purpose |
|---|---|
| `pnpm exec wrangler r2 bucket create <name>` | Create a bucket |
| `pnpm exec wrangler r2 bucket list` | List buckets |
| `pnpm exec wrangler r2 object put <bucket>/<key> --file <path>` | Upload an object |

## References

- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [R2 pricing and free tier](https://developers.cloudflare.com/r2/pricing/)

## Next steps

- [Cache](./cache) — KV cache
- [Website config](./configuration) — the `features.enableFileUpload` switch
- [Database](./database) — where file metadata lives
