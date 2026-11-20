---
title: Cloudflare Email
description: Send transactional email through Email Routing in your Cloudflare account
locale: en
order: 18
group: email
updated: 2026-11-03
---

Cloudflare Email sends through the mail routing inside your own Cloudflare account, with no
third-party service account involved. Prerequisites: the domain is hosted in this Cloudflare
account and Email Routing is enabled for it.

## Steps

1. **Enable Email Routing.** In the dashboard, go to **Email → Email Routing**, enable it, and
   add a verified destination address.

2. **Configure the MX records.** Point the domain's MX at Cloudflare's routing servers as the
   dashboard shows:

   | Record | Value |
   |---|---|
   | Root `MX` | `route1.mx.cloudflare.net` (use the full list from the dashboard) |
   | Root `TXT` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
   | DKIM | `TXT` at `cf2024-1._domainkey` (added automatically when Email Routing is enabled) |

   Email Routing **receives only**: a forwarded message cannot be replied to from the original
   address — reply from the receiving account instead.

3. **Declare the `EMAIL` binding.** Add a `send_email` binding in `wrangler.jsonc`. The binding
   name must be `EMAIL`, because that is the name the code reads:

   ```jsonc title="wrangler.jsonc"
   "send_email": [
     {
       "name": "EMAIL",
       "destination_address": "<your-verified-address>"
     }
   ]
   ```

   This block ships commented out and the sample value `REPLACE_ME` is not a valid delivery
   address — replace it with a real one before enabling. `destination_address` restricts the
   binding to a specific verified address; use the address you actually send to.

4. **Switch provider and set the sending address in the admin.** Open **Settings → Mail**:

   - choose `cloudflare` as the provider;
   - enter the sender address in the Mail group (for example `noreply@<your-domain.com>`);
     leaving it blank falls back to the Cloudflare Email sender field.

   The address must be a plain email address; a display name is rejected. Saving takes effect
   immediately.

   Alternatively put `MAIL_FROM` / `CLOUDFLARE_EMAIL_SENDER` in `.env` and run `pnpm db:seed`.

5. **Deploy.** Changes to the `EMAIL` binding require a redeploy:

   ```bash
   pnpm deploy
   ```

## Difference from Resend

Mail goes through the routing inside your account — no third-party service, no paid sending
tier. The trade-off is that the domain must live on Cloudflare and sends are limited to the
account's verified addresses.

## Verify

After saving in the admin, the `mail` item should stop reporting missing configuration; whether the binding exists is
listed by `pnpm check` as a deployment check. Then trigger a sign-up or a contact form
submission and confirm the message is actually delivered.

```bash
pnpm email:dev
```

Previews the templates in `src/core/email/templates/` on port 3001.

## Notes

- The Cloudflare Email binding **can only send to verified addresses** — check your account's
  limits before deploying.
- The Cloudflare Email sender is only used as a fallback when the mail sender is blank, and
  only while `provider` is `cloudflare`.

Once mail works, continue with the contact form in [Email Overview](./email), or
[Newsletter](./newsletter).
