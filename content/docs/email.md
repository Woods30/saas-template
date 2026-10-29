---
title: Email
description: Wiring Resend / Cloudflare Email and the contact form
locale: en
order: 12
group: features
updated: 2026-10-29
---

`src/mail/index.ts` looks up an instance by provider name from the current request's registry. `sendMail()` retries up to 3 times (250ms, increasing), and returns the last error if all attempts fail.

| Provider | Required config |
|---|---|
| `resend` | `RESEND_API_KEY`, `MAIL_FROM` |
| `cloudflare` | `MAIL_FROM` or `CLOUDFLARE_EMAIL_SENDER`, `EMAIL` binding |

The sender is normalized by `getMailFrom(config, env)`: `MAIL_FROM` first, then `CLOUDFLARE_EMAIL_SENDER` when the provider is Cloudflare. It does **not** fall back to `example.com` — without a sender the provider is not registered, so a call fails loudly instead of silently sending from the wrong address.

The current configuration enables Resend and email verification and sets the support inbox:

```ts
// src/config/website.ts
mail: { enabled: true, provider: 'resend', supportEmail: 'service@jerbix.site' },
auth: { enabled: true, requireEmailVerification: true },
```

## Resend setup

### 1. Verify the sending domain

Add a sending domain or subdomain you own in [Resend Domains](https://resend.com/domains).
Add the DNS records exactly as shown in the dashboard and wait for verification. Use a
verified domain for production verification emails; Resend's testing domain has recipient restrictions.

**Follow the Records tab as shown**: domains created after August 2026 configure the Return-Path
with two `CNAME` records, while older domains use an `MX` + `TXT` pair on the `send` subdomain.
Those `CNAME` records **must not be proxied** (orange cloud) and no other record may share the
same name, or verification never completes. If Cloudflare appends your domain to an `MX` value,
add a trailing dot: `feedback-smtp.<region>.amazonses.com.` The regions are `us-east-1`
(North Virginia), `eu-west-1` (Ireland), `sa-east-1` (São Paulo), and `ap-northeast-1` (Tokyo).

If the same domain also uses Cloudflare Email Routing for inbound mail, the record names differ
and both can coexist — but the root domain may carry only **one** SPF record. See
[Cloudflare](./cloudflare#6-receiving-and-sending-on-the-same-domain).
### 2. Set the API key and sender

Create an API key with sending permission and use it as `RESEND_API_KEY`. Set `MAIL_FROM`
to a **plain email address** on that verified domain, such as `noreply@example.com`.
This project validates it with `z.email()`, so `Brand <noreply@example.com>` is rejected.
Replace the sample with your actual address.
### 3. Local configuration

Locally, add these fields to `.env`, keeping `BETTER_AUTH_URL` aligned with `VITE_BASE_URL`:

```bash
RESEND_API_KEY=your-resend-api-key
MAIL_FROM=noreply@example.com
BETTER_AUTH_URL=http://localhost:3000
```

### 4. Add a DMARC record

After the domain verifies, add a DMARC record to build sender trust and prevent spoofing. Start
at `p=none` (report only), then tighten to `quarantine` and `reject` once every message passes:

```bash
# _dmarc record; the name is _dmarc
v=DMARC1; p=none; rua=mailto:service@jerbix.site
```

Point `rua` at an address that receives reports. `service@jerbix.site` works once that address has
inbound forwarding configured.

### 5. Automatic Release deployment

For automatic deployment, use GitHub **Settings → Environments → production**: set Secret
`RESEND_API_KEY` and Variable `MAIL_FROM`. Secret `MAIL_FROM` is also supported, with
the Variable taking precedence. Neither field uses a **`VITE_` prefix**. Both are already
mapped into validation / build and the runtime `wrangler deploy --secrets-file` allowlist.
### 6. Manual production deployment

For manual deployment, provide the production fields in untracked `.env.production` for
validation and synchronize the Worker runtime bindings, for example with
`pnpm exec wrangler secret put RESEND_API_KEY` and `pnpm exec wrangler secret put MAIL_FROM`.
Use the real HTTPS origin for production `BETTER_AUTH_URL`. Keep local, production
validation, and runtime values consistent within each environment; see [Cloudflare](./cloudflare).

## Sender, support inbox, and auth flow

`mail.supportEmail` is the contact form's **recipient** and the site's support contact;
`MAIL_FROM` is the **sender** for verification, password reset, and welcome emails. They
serve independent purposes: setting one does not populate the other, and you can choose
the addresses separately. The support address is `service@jerbix.site`; the sender must still
be configured for a Resend-verified domain. Setting support contact information does not enable the contact form.

With verification currently required, a missing API key / sender or disabled mail leaves
mail incomplete and `auth` in `incomplete`, makes `/api/auth/*` return 503, and fails production
validation. **Verification is never implicitly disabled to allow unverified sign-in.**
Complete configuration only passes local checks; confirm domain verification, API key
permissions, and actual delivery in Resend.

Auth email timing: sign-up sends verification mail without a session; an unverified user
signing in with the correct password receives another verification email and
403 `EMAIL_NOT_VERIFIED`. Successful verification signs the user in and triggers the welcome
email through `afterEmailVerification`, rather than user creation. See [Authentication](./auth).

> **Note**: The Cloudflare Email binding can only send to verified recipients. Check your account's limits before deploying; `pnpm check` lists this as a manual check but does not factor it into the completeness verdict. Beyond the gate, `/api/email` requires a valid session and the recipient must be in the `ADMIN_EMAILS` allowlist.

## Local preview

Templates live in `src/mail/templates/` (React Email). Start the preview server with `pnpm email:dev` on port **3001** (distinct from `pnpm dev` on 3000); open it in a browser to switch between the four templates with live hot reload:

```bash
pnpm email:dev
```

The preview requires `@react-email/ui` (a devDependency, version-matched to `react-email`).

## Contact form

`contact` depends on `mail` being fully configured — when `contact.enabled` is `true` but `mail` is incomplete, the status is `incomplete` and `/api/contact` returns 503, so a submission is never left with nowhere to go.

Delivery path (`src/contact/notifications.ts`):

1. **Email** — the primary channel, sent to `mail.supportEmail`; failures log `console.warn`;
2. **Webhook** — only when `notification.enabled` is `true`, routed by `notification.provider` to Discord or Feishu; failures do not block the main flow.

```ts
contact: { enabled: true },
```

## References

- [Resend API](https://resend.com/docs/api-reference/introduction) — `RESEND_API_KEY` usage and rate limits
- [Cloudflare Email Service Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) — `send_email` binding and `send()`

## Next steps

- [Newsletter](./newsletter) — one-click subscribe and unsubscribe
- [Payment](./payment) — Stripe checkout and the Price allowlist
