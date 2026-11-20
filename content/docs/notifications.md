---
title: Notifications
description: Wiring Discord / Feishu webhooks and their trigger points
locale: en
order: 20
group: notification
updated: 2026-11-03
---

The notification module pushes key site events to a chat webhook. Discord and Feishu have almost
identical setup, so they share this page: create the bot → copy the webhook URL → enter it in
the admin and pick a provider.

## Steps

1. **Create the webhook.**

   - **Discord**: server settings → Integrations → Webhooks → New Webhook, pick a channel, copy
     the webhook URL.
   - **Feishu**: group settings → bots → add a "custom bot", copy the webhook URL.

2. **Enter the URL and pick a provider.** Open admin **Settings → Notification**:

   enable the module, choose the provider (`discord` / `feishu`), and paste the webhook URL into
   the matching group. The prefix is validated on save:

   | Provider | Field | Required prefix |
   |---|---|---|
   | `discord` | Discord webhook URL | `https://discord.com/api/webhooks/` |
   | `feishu` | Feishu webhook URL | `https://open.feishu.cn/open-apis/bot/v2/hook/` |

   The URL is encrypted at rest; saving takes effect immediately, no deploy needed.

3. **Mismatched provider.** The provider **must match the URL you entered**: selecting `feishu`
   while only the Discord URL is set leaves the service status `incomplete` and lists the missing
   field.

## Trigger points

| Event | Contents | Location |
|---|---|---|
| Successful payment | Plan name, amount, user ID, purchase type | `src/core/payment/events.ts` |
| Contact form submission | Visitor name, email, subject, body | `src/modules/contact/notifications.ts` |

The contact form's email channel and webhook channel **back each other up**: either one
succeeding counts as delivered; only when both fail is the submission reported as failed.

## Verify

After saving in the admin, the `notification` item should stop reporting missing configuration
in the service status. Then make a payment or submit the contact form and confirm the webhook
receives the message.

## Notes

- A failed notification **never blocks** the business flow: an unregistered provider, a failed
  delivery, or a thrown error only logs one `console.warn` and returns `false`.
- Feishu can return HTTP 200 with a non-zero business `code` in the body; the provider parses it
  and treats it as a failure.
- Each webhook request carries a 5-second timeout. Discord embeds truncate titles at 200
  characters and bodies at 1000; the truncation happens in the caller.

Once this works, continue with [Analytics](./analytics) — comparing notifications against
conversion is a common operational need.
