---
title: Sign-in and Sign-up
description: Enable the auth module, add Google sign-in and email verification
locale: en
order: 9
group: auth
updated: 2026-11-03
---

The auth module covers sign-up, sign-in, password reset, and email verification. Pages live at `/{locale}/auth/*`, the API at `/api/auth/*`, and the account area behind sign-in is in [Account settings](./auth-account).

![Sign-in page](/docs/screenshots/auth-login.png "Sign-in: email and password; third-party buttons appear once Google credentials are configured")

## Steps

1. **Turn on the auth module.** Open admin **Settings → Modules** and enable Auth; decide whether
   email verification is required (it is by default) on the same tab.

   The switch gates pages and API together: with it off, both `/{locale}/auth/*` and
   `/api/auth/*` return 404.

2. **Set the two variables production requires.**

   | Variable | Requirement | Purpose |
   |---|---|---|
   | `BETTER_AUTH_SECRET` | At least 32 characters | Signs sessions and email tokens; production deployment fails without it |
   | `BETTER_AUTH_URL` | Full origin | Absolute URL for callbacks and email links; the deploy workflow falls back to `VITE_BASE_URL` |

   Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32` and upload it as a runtime secret as described in [Deploy to Cloudflare](./cloudflare).

3. **(Optional) Add Google sign-in.** Fill in both values in the Google group under admin
   **Settings → Auth**:

   | Field | Purpose |
   |---|---|
   | Client ID | The OAuth client ID from Google Cloud Console |
   | Client secret | The secret of that same client (encrypted at rest) |

   The Google button appears only when both are set; with just the ID there is no button and no entry point that could only fail. Register the callback URLs on the OAuth client in Google Cloud Console:

   | Field | Value |
   |---|---|
   | Authorized JavaScript origin | `https://<your-domain>` |
   | Authorized redirect URI | `https://<your-domain>/api/auth/callback/google` |

   For local development, add `http://localhost:3000` and `http://localhost:3000/api/auth/callback/google` as well.

4. **(Optional) Require email verification.** With `requireEmailVerification: true`, new users must verify their address before signing in. This depends on the mail module: configure a provider and `MAIL_FROM` as described in [Email](./email), otherwise sign-up and sign-in never send a message.

## Verify

- Locally, run `pnpm dev` and sign up at `/{locale}/auth/register`; a verification email should arrive.
- Online, `curl -s https://<your-domain>/api/auth/get-session` returns 200 with `session` as `null`, which means the auth API is healthy.
- `pnpm run check:env:prod` passes (startup variables are valid). Service credentials live in the
  database; confirm each enabled module reads `configured` in the admin overview.

## Notes

- `requireEmailVerification` is a security control, not a mail switch: it does not loosen itself when `mail.enabled` is turned off. Requiring verification without a working mail setup makes the auth API return 503 rather than silently allowing sign-in without verification.
- Google sign-in is not blocked by email verification — Google returns an already-verified address, and only the email and password path is subject to that constraint.
- Secret environment variables never carry a `VITE_` prefix, or they end up in the client bundle.
