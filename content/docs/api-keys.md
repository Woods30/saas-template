---
title: API Keys
description: Self-service API key creation and revocation
locale: en
order: 18
group: features
updated: 2026-10-16
---

API keys are built on better-auth's `@better-auth/api-key` plugin. Users create and revoke
their own keys in the dashboard; your server code verifies them with the same plugin.

## Data model

Keys live in the `apikey` table (`src/db/schema.ts`). Its columns follow the plugin's built-in
`apiKeySchema`: 21 declared fields plus the automatic `id`, with indexes on `config_id` /
`reference_id` / `key`.

**Plaintext never reaches the database.** The plugin hashes the full key with SHA-256, encodes
it as base64url (no padding), and stores that in the `key` column. The list endpoint returns
only `start` (the first few characters), so an issued key can never be read back.

> The `key` column carries **no** unique constraint — it is a hash, collisions are negligible,
> and the plugin itself creates only a plain index.

## Settings page

`/dashboard/api-keys` (`src/routes/{-$locale}/_layout/dashboard/api-keys.tsx`). Its entry
appears in the dashboard sidebar and is governed by the `features.enableApiKeys` flag.

- **Create**: enter a name → `authClient.apiKey.create({ name })`. The response contains the
  **plaintext `key`**; the page shows it once in a second dialog and tells the user to save it.
- **List**: `authClient.apiKey.list()` → `{ apiKeys, total, limit, offset }`. Entries carry no
  plaintext; the mask uses `start`.
- **Delete**: `authClient.apiKey.delete({ keyId })` → `{ success }`.

## Server-side verification

`verifyApiKey` is a **server-only** endpoint and can only be called on the server:

```ts
const result = await getAuth(env).api.verifyApiKey({ body: { key } })
if (!result.valid) return new Response('Unauthorized', { status: 401 })
```

`result` looks like `{ valid: boolean; key: { id, referenceId, ... } | null; error?: { message, code } }`.
On failure `valid` is `false` and `key` is `null`, with the reason in `error.code` (such as
`KEY_NOT_FOUND` / `KEY_EXPIRED` / `KEY_DISABLED`).

Requests use the `x-api-key` header by default.

> **Notes**: `defaultPrefix` is `key_`, so every new key carries that prefix.
>
> **Turning `features.enableApiKeys` off makes the whole `/api/auth/api-key/*` HTTP surface
> return 404** — this is not just the UI disappearing, it is the create / list / delete
> management capability shutting down: users can no longer manage keys through the plugin
> endpoints. The gate lives in the route layer at `src/routes/api/auth/$.ts`.
>
> But **a direct server-side call is unaffected**: `getAuth(env).api.verifyApiKey({ body: { key } })`
> is a function call, not an HTTP route, so it bypasses that gate. Whether an issued key keeps
> working is therefore **the caller's decision**: if you want the flag to disable verification
> too, check `websiteConfig.features.enableApiKeys` in your own route.
>
> **Plaintext appears only in the create response** and is never returned again — a user who
> did not save it must delete the key and create a new one.

## References

- [better-auth API Key plugin](https://www.better-auth.com/docs/plugins/api-key) — options, rate limiting, and refill
- [`@better-auth/api-key`](https://www.npmjs.com/package/@better-auth/api-key) — endpoints such as `verifyApiKey`

## Next steps

- [Authentication](./auth) — sessions and the email/password path
- [Database](./database) — the `apikey` table and migrations
