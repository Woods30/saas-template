---
title: Notifications
description: Wiring Discord / Feishu webhooks
locale: en
order: 9
group: features
updated: 2026-10-15
---

| Provider | Required config |
|---|---|
| `discord` | `DISCORD_WEBHOOK_URL`, must start with `https://discord.com/api/webhooks/` |
| `feishu` | `FEISHU_WEBHOOK_URL`, must start with `https://open.feishu.cn/open-apis/bot/v2/hook/` |

The URL prefix is enforced by the Zod schema.

```ts
notification: { enabled: true },
```

> **Note**: When the provider is unregistered, delivery fails, or it throws, `notify()` only logs `console.warn` and returns `false` — a failed notification never blocks the business flow. Discord embeds are length-capped: titles truncate at 200 chars, bodies at 1000.

## References

- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook) — creating and calling an incoming webhook
- [Feishu custom bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) — custom bot webhook and security settings

## Next steps

- [Analytics](./analytics) — enabling GA / Plausible / Umami / Clarity
- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules
