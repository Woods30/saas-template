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

1. **Pick a provider and enable it.** In `src/config/website.ts`:

   ```ts
   newsletter: { enabled: true, provider: 'resend' },
   ```

   Two providers: `resend` or `beehiiv`.
2. **Set the environment variables.**

   | Provider | Required variables | Where they come from |
   |---|---|---|
   | `resend` | `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` | Both from the Resend dashboard |
   | `beehiiv` | `BEEHIIV_API_KEY` + `BEEHIIV_PUBLICATION_ID` | Both from the Beehiiv dashboard |

   `BEEHIIV_SEND_WELCOME_EMAIL` controls whether Beehiiv sends a welcome email to new subscribers;
   `'true'` / `'false'`, default `'false'`. None of these variables uses a **`VITE_` prefix**.

3. **Deploy.** Hand the variables to the Worker in production
   (`pnpm exec wrangler secret put <NAME>`); with automatic Release deployment, set Secrets of
   the same name in GitHub **Settings → Environments → production**. `RESEND_AUDIENCE_ID` and the
   `BEEHIIV_*` variables are **not** in the deployment workflow's runtime upload allowlist — add
   them to the `env` block and the allowlist in `.github/workflows/deploy.yml` before enabling.

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

`pnpm run check:env` should stop reporting missing configuration under `newsletter`. Then submit
a signup on the page and confirm the address appears in the third-party list.

## Notes

- Rate limiting depends on the KV binding (`CACHE`); without it requests are rejected outright.
- With the module off, endpoints return 404 `MODULE_DISABLED`; when it is on but the variables are
  incomplete they return 503 `SERVICE_UNAVAILABLE`.