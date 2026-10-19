---
title: Notifications
description: Wiring Discord / Feishu webhooks and their trigger points
locale: en
order: 9
group: features
updated: 2026-10-19
---

| Provider | Required config |
|---|---|
| `discord` | `DISCORD_WEBHOOK_URL`, must start with `https://discord.com/api/webhooks/` |
| `feishu` | `FEISHU_WEBHOOK_URL`, must start with `https://open.feishu.cn/open-apis/bot/v2/hook/` |

The URL prefix is enforced by the Zod schema. `provider` must match the webhook you
configured — selecting `feishu` while only `DISCORD_WEBHOOK_URL` is set leaves the
service status at `incomplete`.

```ts
notification: { enabled: true, provider: 'discord' },
```

## Trigger points

| Event | Location |
|---|---|
| Contact form submission | `src/contact/notifications.ts` |
| Successful payment (renewal / one-time) | `src/routes/api/webhooks/stripe.ts` |

`notify()` deliberately does **not** maintain an event→channel table — the caller knows
which provider to use. Event semantics ("someone paid") and delivery channel (Discord
vs Feishu) are separate concerns, and binding them together means every new channel
touches a pile of unrelated code.

## Error handling

When the provider is unregistered, delivery fails, or it throws, `notify()` only logs
`console.warn` and returns `false` — a failed notification never blocks the business
flow.

Two provider details matter:

- **Feishu can return HTTP 200 with a business failure**. Signature / keyword / IP
  allowlist checks fail with `{ code: 19021, msg: … }` and status 200. Judging only
  `res.ok` treats failure as success and `notify()` never warns. So the Feishu provider
  parses `code` and treats non-zero as failure.
- **Requests carry a 5-second timeout** (`AbortSignal.timeout`). A hanging webhook
  would stall the whole request, and notifications are not important enough to time
  out a query.

Discord surfaces errors in the HTTP status (429 rate limit, 401 invalid, 400 malformed),
so there is no response body to parse.

Discord embeds are length-capped: titles truncate at 200 chars, bodies at 1000. The
truncation lives in the **caller** (the contact module); the provider only delivers.

## References

- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook) — creating and calling an incoming webhook
- [Feishu custom bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) — custom bot webhook and security settings

## Next steps

- [Analytics](./analytics) — enabling GA / Plausible / Umami / Clarity
- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules
