---
title: Newsletter
description: Wiring the subscriber list, its endpoints, and rate limits
locale: en
order: 19
group: email
updated: 2026-11-03
---

The newsletter module collects visitor emails into a list. The list lives in a third-party service
(Resend Audiences or Beehiiv); this site only receives signups and reads the status. Once enabled
there are two entry points: the signup box on marketing pages (the `NewsletterCta` component) and
the preference toggle in the account area (`/settings/notifications`).

## Steps

1. **Enable it and pick a provider.** Turn on Newsletter under admin **Settings → Modules**, then
   choose `resend` or `beehiiv` under **Mail → Newsletter**.

   Two providers: `resend` or `beehiiv`.
2. **Enter credentials.** On the same tab:

   | Provider | Required fields | Where they come from |
   |---|---|---|
   | `resend` | Resend API key + Audience ID | Both from the Resend dashboard |
   | `beehiiv` | Beehiiv API key + Publication ID | Both from the Beehiiv dashboard |

   The Beehiiv group also has a "send welcome email" switch, off by default. Secrets are
   encrypted at rest and masked; saving takes effect immediately.

   Alternatively put the same values in `.env` and run `pnpm db:seed` to write them to the
   database.

3. **No redeploy needed.** The configuration lives in the database; saving is enough.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/newsletter` | Subscribe, body `{ email }` |
| `DELETE` | `/api/newsletter` | Unsubscribe, body `{ email }` |
| `GET` | `/api/newsletter?email=` | Read subscription status for the account toggle |

Subscribe and unsubscribe are rate limited per IP: **5 requests per minute**, returning 429 when
exceeded. The status read is not rate limited; its result is cached in KV for one hour, and
subscribing or unsubscribing invalidates that key immediately.

## Verify

After saving in the admin, the service status should stop reporting missing configuration under `newsletter`. Then submit
a signup on the page and confirm the address appears in the third-party list.

## Notes

- Rate limiting depends on the KV binding (`CACHE`); without it requests are rejected outright.
- With the module off, endpoints return 404 `MODULE_DISABLED`; when it is on but the variables are
  incomplete they return 503 `SERVICE_UNAVAILABLE`.