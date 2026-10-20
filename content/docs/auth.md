---
title: Authentication
description: Email/password and Google sign-in, email flows, session guards, and form conventions
locale: en
order: 10
group: features
updated: 2026-10-15
---

Email/password plus Google OAuth, built on Better Auth v1.7.7 with the Drizzle adapter
(D1 / SQLite). Pages live at `/{locale}/auth/*`, the API at `/api/auth/*`, and the account
center at `/{locale}/dashboard/*`.

## Enabling

Two fields in `websiteConfig.auth`, plus three environment variables:

```ts
// src/config/website.ts
auth: { enabled: true, requireEmailVerification: false },
```

| Config / variable | When required | Purpose |
|---|---|---|
| `auth.enabled` | — | Gates pages and API together. When off, pages 404 via `assertPageEnabled('auth')` and `/api/auth/*` returns `404 { error: 'MODULE_DISABLED' }` before reaching Better Auth |
| `auth.requireEmailVerification` | Set to `true` once mail is wired up | Whether an unverified email can sign in — see [below](#requireemailverification-is-a-security-control-not-a-mail-switch) |
| `BETTER_AUTH_SECRET` | Required in production | Signs sessions and email tokens, ≥ 32 characters; enforced by `check:env:prod` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | When enabling Google sign-in | OAuth credentials, both required |

When `BETTER_AUTH_SECRET` is unset locally, Better Auth falls back to its development
secret and `auth` still reports `configured` — the gate never blocks local development.

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
| Email verification | On sign-up, and when an unverified user signs in | `verifyEmail` |
| Password reset | "Forgot password" | `forgotPassword` |
| Welcome | `databaseHooks.user.create.after` | `welcome` |

`src/auth/emails.ts` is the only bridge between Better Auth callbacks and the mail
registry. Two defences must stay:

- **Never throw.** Better Auth invokes the callbacks through `runInBackgroundOrAwait`, so a
  throw makes **sign-up or sign-in fail**. All errors collapse into `{ ok: false, error }`
  plus a `console.warn`.
- **Skip silently when mail is off.** With `mail.enabled: false` or no sender configured,
  it returns without attempting to send.

The recipient locale is resolved from the `Request` passed as the callback's second
argument (URL prefix → cookie → `Accept-Language` → default), so a Chinese visitor gets a
Chinese email with no extra wiring.

### Verification link

The email link points at `/api/auth/verify-email?token=…&callbackURL=/{locale}/auth/verify-email`.
This is a **GET** endpoint on the Better Auth side: it verifies then redirects, appending
`?error=<code>` on failure, which the landing page renders as "link invalid or expired".
The landing page itself calls no client SDK.

### Reset link

`requestPasswordReset` returns success whether or not the address exists, to prevent
account enumeration. `redirectTo` carries the current locale prefix, so the reset page
returns in the same language.

## `requireEmailVerification` is a security control, not a mail switch

This field (default `false`) decides whether a user can sign in without proving they own
the address. It deliberately does **not** derive from `mail.enabled`: email is an identity
anchor downstream — `src/routes/api/payment/$.ts` passes `session.user.email` to Stripe as
`customerEmail`, and `/api/email` authorizes on `ADMIN_EMAILS` membership. Letting "SMTP is
not configured yet" quietly become "anyone can register with someone else's address" is
privilege escalation.

The default is `false` only because the template ships without mail: if verification were
required by default, Better Auth would reject every unverified sign-in and stop
auto-signing-in on sign-up, leaving the whole email/password path unusable out of the box.
**Wiring up mail is a two-step change** — configure `mail` first, then flip this to `true`.

Security-side reads all go through `requiresEmailVerification()` in `src/auth/flow.ts`, so
the server and the UI cannot disagree. `signUpOutcome()` in the same module decides where
sign-up lands: with `false`, Better Auth **auto-signs-in** the new user and the page must
redirect home; sending a signed-in user to "check your inbox" means waiting for an email
that will never be sent.

`requireEmailVerification: true` with mail not fully configured is a **contradictory
configuration**: `getServiceStatuses()` reports `auth` as incomplete and `check:env:prod`
fails — verification is required but no email can be sent, so new users could never sign in.

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

login and register render a line below the form card: "By clicking continue, you agree to our
Terms of Service and Privacy Policy", linking to `/marketing/legal/terms` and
`/marketing/legal/privacy` and following the current locale. The pattern follows shadcn's
`login-03` block: the notice is a sibling of the card, because inside the card it reads as part
of the form.

It is controlled by the `legalNotice` prop on `AuthLayout` and is **off by default**. Only pages
where the user is actively consenting pass it: `verify-email` is a terminal state with no submit
button, users on `reset-password` / `forgot-password` are not creating an account, and `error`
has no action to consent to. Of register's two `AuthLayout` call sites, only the form one passes
it — by the time "check your inbox" appears the account exists and consent already happened.

> **Note**: the Terms and privacy bodies live under `content/legal/` and are **templates with
     placeholder prompts**. Before going live, replace every "fill in before deploying" item with
     your real facts — at minimum: data retention period, the sub-processor list (with each one's
     DPA), refund window, liability cap, governing law and venue, a contact email, and which
     cookies this deployment actually sets. Placeholders are written as `> **Note**` so they render
     as prominent Alerts; once they are all replaced, consider dropping the "this document is
     template placeholder content" note at the top of each file.

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
