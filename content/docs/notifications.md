---
title: Notifications
description: Wiring Discord / Feishu webhooks and their trigger points
locale: en
order: 20
group: notification
updated: 2026-11-03
---

The notification module pushes key site events to a chat webhook. Discord and Feishu have almost
identical setup, so they share this page: create the bot → copy the webhook URL → set the
environment variable → switch the provider.

## Steps

1. **Create the webhook.**

   - **Discord**: server settings → Integrations → Webhooks → New Webhook, pick a channel, copy
     the webhook URL.
   - **Feishu**: group settings → bots → add a "custom bot", copy the webhook URL.

2. **Set the environment variable.** The URL prefixes are enforced by the schema, so a wrong one
   fails at startup:

   | Provider | Variable | Required prefix |
   |---|---|---|
   | `discord` | `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/` |
   | `feishu` | `FEISHU_WEBHOOK_URL` | `https://open.feishu.cn/open-apis/bot/v2/hook/` |

   Neither variable uses a **`VITE_` prefix**.

3. **Switch the provider.** In `src/config/website.ts`:

   ```ts
   notification: { enabled: true, provider: 'discord' },
   ```

   Two providers, and it **must match the webhook you configured**: selecting `feishu` while
   only `DISCORD_WEBHOOK_URL` is set leaves the diagnostic at `incomplete`.

4. **Deploy.** Hand the webhook URL to the Worker in production:

   ```bash
   pnpm exec wrangler secret put DISCORD_WEBHOOK_URL
   ```

   With automatic Release deployment, set a Secret of the same name in GitHub **Settings →
   Environments → production**. `DISCORD_WEBHOOK_URL` is already in the deployment workflow's
   runtime upload allowlist; **`FEISHU_WEBHOOK_URL` is not** — if you use Feishu, add it to the
   `env` block and the upload allowlist in `.github/workflows/deploy.yml` yourself.

## Trigger points

| Event | Contents | Location |
|---|---|---|
| Successful payment | Plan name, amount, user ID, purchase type | `src/core/payment/events.ts` |
| Contact form submission | Visitor name, email, subject, body | `src/modules/contact/notifications.ts` |

The contact form's email channel and webhook channel **back each other up**: either one
succeeding counts as delivered; only when both fail is the submission reported as failed.

## Verify

```bash
pnpm run check:env
```

The `notification` item should stop reporting missing configuration. Then make a payment or
submit the contact form and confirm the webhook receives the message.

## Notes

- A failed notification **never blocks** the business flow: an unregistered provider, a failed
  delivery, or a thrown error only logs one `console.warn` and returns `false`.
- Feishu can return HTTP 200 with a non-zero business `code` in the body; the provider parses it
  and treats it as a failure.
- Each webhook request carries a 5-second timeout. Discord embeds truncate titles at 200
  characters and bodies at 1000; the truncation happens in the caller.

Once this works, continue with [Analytics](./analytics) — comparing notifications against
conversion is a common operational need.
