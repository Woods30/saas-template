---
title: Email
description: Wiring Resend / Cloudflare Email and the contact form
locale: en
order: 6
group: features
updated: 2026-10-14
---

`src/mail/index.ts` looks up an instance by provider name from the current request's registry. `sendMail()` retries up to 3 times (250ms, increasing), and returns the last error if all attempts fail.

| Provider | Required config |
|---|---|
| `resend` | `RESEND_API_KEY`, `MAIL_FROM` |
| `cloudflare` | `MAIL_FROM` or `CLOUDFLARE_EMAIL_SENDER`, `EMAIL` binding |

The sender is normalized by `getMailFrom(config, env)`: `MAIL_FROM` first, then `CLOUDFLARE_EMAIL_SENDER` when the provider is Cloudflare. It does **not** fall back to `example.com` — without a sender the provider is not registered, so a call fails loudly instead of silently sending from the wrong address.

```ts
mail: { enabled: true, provider: 'resend', supportEmail: 'support@your-domain.com' },
```

> **Note**: The Cloudflare Email binding can only send to verified recipients. Check your account's limits before deploying; `pnpm check` lists this as a manual check but does not factor it into the completeness verdict. Beyond the gate, `/api/email` requires a valid session and the recipient must be in the `ADMIN_EMAILS` allowlist.

## Contact form

`contact` depends on `mail` being fully configured — when `contact.enabled` is `true` but `mail` is incomplete, the status is `incomplete` and `/api/contact` returns 503, so a submission is never left with nowhere to go.

Delivery path (`src/contact/notifications.ts`):

1. **Email** — the primary channel, sent to `mail.supportEmail`; failures log `console.warn`;
2. **Discord** — only when `notification.enabled` is `true`; failures do not block the main flow.

```ts
contact: { enabled: true },
```

## Next steps

- [Newsletter](./newsletter) — one-click subscribe and unsubscribe
- [Payment](./payment) — Stripe checkout and the Price allowlist
