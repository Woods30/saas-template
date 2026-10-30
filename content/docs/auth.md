---
title: Authentication
description: Email/password and Google sign-in, email flows, session guards, and form conventions
locale: en
order: 10
group: features
updated: 2026-10-29
---

Email/password plus Google OAuth, built on Better Auth v1.7.10 with the Drizzle adapter
(D1 / SQLite). Pages live at `/{locale}/auth/*`, the API at `/api/auth/*`, and the account
center at `/{locale}/dashboard/*`.

## Enabling

![Sign-in page](/docs/screenshots/auth-login.png "Sign-in: email and password; third-party buttons appear once Google credentials are configured")

Authentication, Resend mail, and email verification are enabled by default:

```ts
// src/config/website.ts
auth: { enabled: true, requireEmailVerification: true },
mail: { enabled: true, provider: 'resend', supportEmail: 'service@jerbix.site' },
```

`supportEmail` is `service@jerbix.site`. It receives support messages and is configured separately
from the sending address `MAIL_FROM`; see [Email](./email).

| Config / variable | When required | Purpose |
|---|---|---|
| `auth.enabled` | — | Gates pages and API together. When off, pages 404 via `assertPageEnabled('auth')` and `/api/auth/*` returns `404 { error: 'MODULE_DISABLED' }` before reaching Better Auth |
| `auth.requireEmailVerification` | Currently defaults to `true` | Unverified users cannot sign in with a password — see [below](#requireemailverification-is-a-security-control-not-a-mail-switch) |
| `RESEND_API_KEY` / `MAIL_FROM` | Required for the current Resend configuration | API key and a plain sender email address on a verified domain |
| `BETTER_AUTH_URL` | Email verification / Google sign-in | `http://localhost:3000` locally; the real HTTPS origin in production |
| `BETTER_AUTH_SECRET` | Required in production | Signs sessions and email tokens, ≥ 32 characters; enforced by `check:env:prod` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | When enabling Google sign-in | OAuth credentials, both required |

When `BETTER_AUTH_SECRET` is unset locally, Better Auth can fall back to its development
secret. Mail must still be configured in `.env` because email verification is required.
Missing `RESEND_API_KEY` / `MAIL_FROM`, or disabled mail, makes `auth` report `incomplete`,
`/api/auth/*` return 503, and `pnpm check:env:prod` fail. Verification is never implicitly disabled.

## Google sign-in

The credentials must be configured **as a pair**. `getAuthProviderAvailability` returns
`google: true` only when both the ID and the secret exist, and the login page renders the
button only then. With just a client ID, Better Auth does not register the provider either,
so showing the button would only funnel users into a flow that cannot succeed.

The credentials are server secrets and unreadable from the client bundle. The login page's
`beforeLoad` calls `fetchAuthProviderAvailability` (a server function): it evaluates in
place during SSR and degrades to one RPC on client navigation. A plain function would make
the button silently disappear when entering the page from the navbar.

## Email flows

Three templates, rendered by the mail provider described in [Email](./email):

| Flow | Trigger | Template |
|---|---|---|
| Email verification | On sign-up (`sendOnSignUp: true`); resent when an unverified user signs in with the correct password (`sendOnSignIn: true`) | `verifyEmail` |
| Password reset | "Forgot password" | `forgotPassword` |
| Welcome | `emailVerification.afterEmailVerification`, after successful email verification | `welcome` |

Sign-up creates the user and sends a verification email, **without creating a session**.
An unverified user signing in with the correct password receives another verification email
and **403 `EMAIL_NOT_VERIFIED`**, again without a session. After successful verification,
`autoSignInAfterVerification: true` creates a session and the welcome email is triggered.
Creating a user no longer sends the welcome email.

`src/auth/emails.ts` is the only bridge between Better Auth callbacks and the mail
registry. Two defences must stay:

- **Never throw.** Better Auth invokes the callbacks through `runInBackgroundOrAwait`, so a
  throw makes **sign-up or sign-in fail**. All errors collapse into `{ ok: false, error }`
  plus a `console.warn`.
- **Do not attempt delivery when mail is off or the sender is missing.** The bridge returns
  `{ ok: false, error }` and the caller logs a warning. This does not change the auth gate:
  requiring verification with incomplete mail makes the API return 503 before Better Auth runs.

The recipient locale is resolved from the `Request` passed as the callback's second
argument (URL prefix → cookie → `Accept-Language` → default), so a Chinese visitor gets a
Chinese email with no extra wiring.

### Verification link

The email link points at `/api/auth/verify-email?token=…&callbackURL=…`, where `callbackURL`
is the encoded `/{locale}/auth/verify-email?redirect=<internal target>`. Both sign-up and
password sign-in preserve a safe internal purchase target. `safeInternalPath()` rejects
external origins, `//`, backslashes, and control characters; absent or invalid targets fall back to `/`.

This is a **GET** endpoint on the Better Auth side: it verifies then redirects to the result
page, appending `error=<code>` on failure. The result page treats any `error` parameter as a
failure and offers a sign-in link retaining `redirect`, so unknown errors cannot appear as
success. On success, its "Continue" link uses `resolveRedirectTarget(redirect)` as `href`
and performs a full-page navigation to the safe internal target to refresh the session.
The page calls no client SDK; preserving the purchase target does not automatically start checkout.

### Reset link

`requestPasswordReset` returns success whether or not the address exists, to prevent
account enumeration. `redirectTo` carries the current locale prefix, so the reset page
returns in the same language.

## `requireEmailVerification` is a security control, not a mail switch

This field currently defaults to `true` and decides whether a user can sign in with a
password without proving ownership of the address. It deliberately does **not** derive from
`mail.enabled`: email is an identity anchor downstream — payments pass `session.user.email`
to Stripe, and `/api/email` authorizes on `ADMIN_EMAILS` membership. Missing mail configuration
must not silently weaken identity verification.

Security-side reads all go through `requiresEmailVerification()` in `src/auth/flow.ts`, so
the server and the UI cannot disagree. `signUpOutcome()` in the same module decides where
sign-up lands: the current configuration shows "check your inbox". Only an explicit change
to `false` makes Better Auth auto-sign-in on sign-up and the page redirect to the safe internal target.

`requireEmailVerification: true` with incomplete mail is a **contradictory configuration**:
`getServiceStatuses()` reports `auth` as `incomplete`, the auth API returns 503, and
`check:env:prod` fails. Complete the mail configuration to restore service; verification
is never automatically disabled.

## Session and sign-out

The navbar account area (`src/components/layout/UserMenu.tsx`) reads the real session via
`authClient.useSession()`:

- **Pending**: renders the guest entry point, same as signed out. Rendering a skeleton here
  would leave the server HTML with no sign-in entry at all, so visitors would see it only
  after the client fetches the session.
- **Signed out**: a sign-in link.
- **Signed in**: an account menu with "Account settings" and "Sign out". A failed sign-out
  stays on the page rather than navigating, so users do not think the session ended.

Guarding protected routes (the account center) is covered in [Account center](./auth-account).

## Form submission before hydration

Submit buttons are **disabled** in the server HTML and become clickable only after
hydration (`useHydrated` + `SubmitButton`). Without that defence, a click landing before
React takes over degrades into a native form submission: the fields are serialized into the
query string as a **GET**, putting **the password in the address bar, browser history, and
the `Referer` header** while the page merely reloads. The button stays visible while
disabled, so there is no layout shift.

Forms themselves use TanStack Form + Zod throughout — see [Form conventions](./forms).

## Legal notice on the sign-in / sign-up pages

login and register render "By clicking continue, you agree to our Terms of Service and
Privacy Policy" **inside the form card's `CardFooter`**, linking to `/marketing/legal/terms`
and `/marketing/legal/privacy` in the current locale. The "Back to home" link is outside the card.

It is controlled by the `legalNotice` prop on `AuthLayout` and is **off by default**. Only pages
where the user is actively consenting pass it: `verify-email` is a terminal state with no submit
button, users on `reset-password` / `forgot-password` are not creating an account, and `error`
has no action to consent to. Of register's two `AuthLayout` call sites, only the form one passes
it — by the time "check your inbox" appears the account exists and consent already happened.

Terms and privacy content lives in `content/legal/`, written for Jerbix,
`https://www.jerbix.site`, and `service@jerbix.site`. It covers one-time source-code purchases,
MIT licensing, refunds, and actual data processing. It does not select an exclusive jurisdiction;
operator identity or address disclosures may still be required by applicable operating or target-market
rules. When reusing the project, adapt the content to your own operation and providers.

## Production

### Resend and runtime configuration

Verify your sending domain in Resend and set `MAIL_FROM` to a plain email address on that
domain, without a display name or angle brackets. Locally, configure `RESEND_API_KEY`,
`MAIL_FROM`, and `BETTER_AUTH_URL` in `.env`. In the GitHub `production` Environment, set
Secret `RESEND_API_KEY` and Variable `MAIL_FROM`, **without a `VITE_` prefix**. The workflow
also accepts Secret `MAIL_FROM`, with the Variable taking precedence, and uploads both
fields through the `--secrets-file` allowlist. For manual deployments, values used for
validation in `.env.production` must match Worker runtime bindings; see [Email](./email)
and [Cloudflare](./cloudflare).

### `BETTER_AUTH_SECRET`

For a manual production deployment, upload the runtime secret with Wrangler; do not commit it:

```bash
printf '%s' "$BETTER_AUTH_SECRET" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

It must be at least 32 characters; generate one with `openssl rand -base64 32`. Missing or
short production secrets are rejected by `validateProdServerEnv`, so `pnpm deploy` fails
at validation. The copy in `.env.production` satisfies validation; runtime reads the Worker
secret. **The values must match.** Automatic Release deployment uses GitHub configuration
and uploads the runtime binding; see [Environment variables](./environment).

### `BETTER_AUTH_URL`

This is the absolute base URL for callbacks and redirects. If empty, Better Auth derives
it from the request origin and warns that the base URL is unset. **Set it explicitly for
Google OAuth or email verification** so callback URLs and email links do not vary with the
request origin. Use the real HTTPS origin in production, matching `VITE_BASE_URL`.

### Google OAuth callback URL

Configure the OAuth client in Google Cloud Console with:

| Field | Value |
|---|---|
| Authorized JavaScript origin | `https://your-domain.com` |
| Authorized redirect URI | `https://your-domain.com/api/auth/callback/google` |

Also register `http://localhost:3000` and `http://localhost:3000/api/auth/callback/google`
for local development. One client can include both environments. Leave both
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` empty if unused; the provider and button remain absent.

Production currently uses `https://www.jerbix.site`, so the redirect URI must be
`https://www.jerbix.site/api/auth/callback/google`. Configure the credentials in the GitHub
`production` Environment as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The workflow accepts
either a Variable or a Secret for both, but **Secret is safer** — a client secret must never
reach the client bundle.

**Google sign-in is not blocked by `requireEmailVerification`**: Google returns `email_verified`,
and Better Auth marks the account verified accordingly. Only the email/password path returns 403
for unverified accounts.

## Key invariants when changing this

Check each before touching auth code:

- `requireEmailVerification` does **not** follow `mail.enabled`; `true` with incomplete mail
  config is rejected by `check:env:prod`.
- Where sign-up lands is decided by `signUpOutcome()` — do **not** unconditionally say
  "check your inbox".
- Social credential visibility must go through a server function
  (`fetchAuthProviderAvailability`).
- Submit buttons must be disabled before hydration.
- Auth forms must set `noValidate` on the `<form>`: `<Input type="email">` triggers native
  constraint validation, which blocks `submit` outright on an invalid value, so schema
  validation and its error messages would never run.
- Email callbacks must never throw; a throw takes sign-up/sign-in down with it.
- Protected routes check the session in `beforeLoad` with `fetchSession()` and `redirect` to
  the login page when signed out.
- With `session.cookieCache` enabled, **cross-device revocation** does not invalidate the
  revoked device right away: the cached cookie is a signed JWT with its own expiry, and only
  the D1 row is deleted. `maxAge` is that window; it is currently 30 seconds. Sign-out,
  password changes, and account deletion also clear the cache cookie on that device and are
  not affected. If the site grows or revocation sensitivity rises, lower `maxAge` or disable
  the cache.

## References

- [Better Auth options](https://www.better-auth.com/docs/reference/options) — `BETTER_AUTH_SECRET` and other settings
- [Better Auth Google provider](https://www.better-auth.com/docs/authentication/google) — Google credentials and setup
- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server) — the authorization code flow
- [TanStack Start authentication guide](https://tanstack.com/start/latest/docs/framework/react/guide/authentication) — sessions, protected routes, server functions

## Next steps

- [Account center](./auth-account) — protected routes, the session guard, and the four sections
- [Form conventions](./forms) — the minimal copyable TanStack Form + Zod + `Field` pattern
- [Email](./email) — the mail provider and the contact form
- [Environment variables](./environment) — every variable and its read layer
- [Cloudflare](./cloudflare) — deployment and runtime secret configuration
