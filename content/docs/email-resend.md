---
title: Resend
description: Verify a sending domain, create an API key, and deploy
locale: en
order: 17
group: email
updated: 2026-11-03
---

Resend is a third-party transactional email service. This site uses it for verification emails,
welcome messages, password reset links, and contact form messages.
Prerequisites: the domain is on DNS, and you verify it as a sending domain in Resend.

## Steps

1. **Verify the sending domain.** Add a domain you own in
   [Resend Domains](https://resend.com/domains), configure the DNS records exactly as the Records
   tab shows, and wait for the status to become Verified.

   - **Follow the Records tab as shown**: domains created after August 2026 configure the
     Return-Path with two `CNAME` records, while older domains use an `MX` + `TXT` pair on the
     `send` subdomain.
   - Those `CNAME` records **must not be proxied** (orange cloud), and no other record may share
     the same name, or verification never completes.
   - If Cloudflare appends your domain to an `MX` value, add a trailing dot:
     `feedback-smtp.<region>.amazonses.com.`

   Production verification emails must use a verified domain; Resend's testing domain has
   recipient restrictions.

2. **Create an API key.** In [Resend API Keys](https://resend.com/api-keys), create a key with
   **sending permission** and save it — it is shown only once.

3. **Configure it in the admin.** Open **Settings → Mail**:

   - choose `resend` as the provider;
   - enter the API key in the Resend group (encrypted at rest, masked to the last four characters);
   - enter the sender address in the Mail group (for example `noreply@<your-domain.com>`).

   Saving takes effect immediately — no redeploy. The sender must be a **plain email address**;
   `Brand <noreply@...>` is rejected.

   Alternatively put `RESEND_API_KEY` and `MAIL_FROM` in `.env` and run `pnpm db:seed` to write
   them along with everything else — env is read once, at seed time.

## DMARC

After the domain verifies, add a DMARC record (record name `_dmarc`). Start at `p=none`
(report only) and tighten to `quarantine` and `reject` once every message passes:

```bash
v=DMARC1; p=none; rua=mailto:<your-support-email>
```

Point `rua` at an address that actually receives reports.

## Verify

After saving in the admin, the `mail` item in the service status should stop reporting missing
configuration. Then run the site locally, trigger a
sign-up or a contact form submission, and confirm the message shows up in Resend's "Sent" list —
a complete configuration only means the checks pass; domain verification and actual delivery are
still confirmed in Resend.

```bash
pnpm email:dev
```

Previews the four templates in `src/core/email/templates/` (verification, password reset,
contact message, welcome) on port 3001, with live hot reload.

## Notes

- If the same domain also uses Cloudflare Email Routing for inbound mail, the record names differ
  and both can coexist — but the root domain may carry only **one** SPF record.
- Changing the sender address takes effect as soon as the admin saves.

Once mail works, continue with the contact form in [Email Overview](./email), or
[Newsletter](./newsletter).
