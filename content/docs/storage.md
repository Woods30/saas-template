---
title: File Storage
description: Enabling, binding, and using Cloudflare R2
locale: en
order: 7
group: deploy
updated: 2026-11-19
---

User uploads live in **Cloudflare R2**, reached through the Workers `BUCKET` binding with zero egress fees. The code is in `src/core/storage/`.

> The storage layer is implemented, but the repository ships **no generic upload route**: there is no `/api/files` endpoint under `src/routes/api/`. This page covers how to wire it up when you need it. Not connecting R2 does not affect the template.

## Steps

1. **Enable R2 in the Dashboard.** This cannot be done through the API — R2 must be activated once in the Dashboard (a payment method is required; the free tier costs nothing). Until then the API rejects requests:

   ```text
   [code: 10042] Please enable R2 through the Cloudflare Dashboard.
   ```

2. **Create a bucket.**

   ```bash
   pnpm exec wrangler r2 bucket create <your-bucket-name>
   ```

3. **Configure the binding.** Uncomment the `r2_buckets` block in `wrangler.jsonc` and fill it in:

   ```jsonc title="wrangler.jsonc"
   "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "<your-bucket-name>" }]
   ```

   The `binding` is the name code reads (`env.BUCKET`) and must match `src/types/cloudflare.d.ts`. Without the binding `env.BUCKET` is `undefined` and `getStorageProvider()` throws — that is the intended degradation.

4. **Add your own upload route.** The repository has no generic upload API; create a route under
   `src/routes/api/`, authorize it yourself, and call `uploadFile` inside it (see the usage below).

## Usage

All functions are imported from `@/storage` and resolve the current request's provider through AsyncLocalStorage:

```ts
import { uploadFile, deleteFile, downloadFile, getFileInfo, listUserFiles } from '@/storage'

// Upload: folder is limited to uploads / avatars / documents
const result = await uploadFile(arrayBuffer, 'photo.png', 'image/png', {
  folder: 'uploads',
  userId: 'user_abc',
  visibility: 'private',
})
// → { key, url, metadata }

// Delete: the second argument true means the caller confirmed ownership
await deleteFile(key, true)

// Download: private files require an explicit true
const stream = await downloadFile(key, true)

// Look up
const info = await getFileInfo(key)                 // { key, size, contentType, uploadedAt } | null
const { objects, nextCursor } = await listUserFiles('user_abc')
```

## Security rules

- **The bucket stays private.** Do not attach a public domain and do not use an `r2.dev` subdomain; every read and write goes through the Worker on the server.
- **Authorization is not in the storage layer.** `deleteFile` and `downloadFile` only look at the `authorized` boolean and never query ownership, so the caller must check the session and the ownership first — otherwise any signed-in user can delete or overwrite someone else's files.
- The key is assembled on the server, shaped like `uploads/<userId>/<timestamp>-<filename>`: `folder` must be a whitelisted value, and `/`, `\`, `..` and a leading `.` in the filename or user id are stripped while other illegal characters become `_`.

## Common commands

| Command | What it does |
|---|---|
| `pnpm exec wrangler r2 bucket create <name>` | Create a bucket |
| `pnpm exec wrangler r2 bucket list` | List buckets |
| `pnpm exec wrangler r2 object put <bucket>/<key> --file <path>` | Upload an object |

Once this is wired up you can move on to [Cache](./cache).
