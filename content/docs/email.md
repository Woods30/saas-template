---
title: Email Overview
description: What the mail module does, the two addresses, and picking a provider
locale: en
order: 16
group: email
updated: 2026-11-19
---

The mail module gives the site three ways to send email: verification and welcome messages,
contact form submissions forwarded to your inbox, and manual sends from the admin area.
There are two providers — **Resend** or **Cloudflare Email** — each with its own setup page.

## Three decisions

| Decision | Where | What it does |
|---|---|---|
| Sending address | Admin → Mail → Sender | The sender of verification, password reset, and welcome emails |
| Support inbox | Admin → Mail → Support address | Where contact form messages go; also the footer's `mailto:` link |
| Switch | Admin → Modules → Mail | When off, mail APIs return 404 `MODULE_DISABLED` |

The first two are **independent**: setting one never fills in the other, and you can pick
different addresses for them. The sender must be a plain email address
(`noreply@<your-domain.com>`); `Brand <noreply@...>` is rejected.

These values live in the database and take effect as soon as the admin saves. Same-named
variables in `.env` are only initial values for `pnpm db:seed`.

## Picking a provider

| Provider | Required config | Setup page |
|---|---|---|
| `resend` | Resend API key + sender address | [Resend](./email-resend) |
| `cloudflare` | Sender address (or the Cloudflare Email sender) + the `EMAIL` binding | [Cloudflare Email](./email-cloudflare) |

## What you get once it is on

- **Auth email**: with `auth.requireEmailVerification` at `true` (the default), sign-up sends a
  verification email, successful verification sends the welcome email, and password reset sends
  the reset link. When mail is not fully configured, `auth` is flagged as a conflict and
  `/api/auth/*` returns 503 — verification is **never** silently turned off.
- **Contact form**: with `contact.enabled` at `true`, submissions are sent to
  `mail.supportEmail`. It depends on the mail module being fully configured; otherwise
  `/api/contact` returns 503 rather than telling the visitor the message was delivered.
- **Manual sends**: `/api/email` sends a template email from the admin area. It requires a
  session and the recipient must be in the `ADMIN_EMAILS` allowlist.

## Verify

The admin overview reports missing configuration for each enabled module (same diagnosis as
`getServiceStatuses`); mail diagnostics show up under `mail`.

```bash
pnpm email:dev
```

Previews the templates in `src/core/email/templates/` on port 3001, with hot reload.

## Notes

- Only one provider is live at a time — `mail.provider` picks the path.
- Without an API key or a sending address the provider is not registered, so calls fail loudly
  instead of sending from a placeholder address.
- Subjects and bodies are rendered in the visitor's language; a new template needs both Chinese
  and English copy.

Once mail works, [Newsletter](./newsletter) reuses the same credentials to collect subscribers.
