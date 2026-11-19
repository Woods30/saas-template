---
title: Site configuration
description: The settings registry, admin settings, secret encryption and gating
locale: en
order: 2
group: config
updated: 2026-11-19
---

There is exactly one source of site configuration: the `settings` table in the database, one
row per field. Saving in the admin **Settings** page takes effect immediately — no redeploy.
Nothing reads environment variables at runtime; env is only used by `pnpm db:seed` as the
initial value.

## The registry

`src/core/config/registry.ts` is the single source of truth. Each field declares:

```ts
{
  key: 'brand.name',            // primary key in `settings`, dot-separated
  kind: 'text',                 // decides the admin control and validation
  label: () => m.…(),           // copy
  defaultValue: 'Jerbix',       // value when the row is absent
  secret: false,                // whether to encrypt at rest and mask on read
  envKey: 'RESEND_API_KEY',     // env name read only by db:seed
}
```

The admin form, the seed, per-field validation and the `settings` table all derive from it.
Adding a setting means editing the registry and the copy — no page changes.

Data flow:

```text
settings rows → decrypt → per-field validation → resolveSettingsValues → applySettingsToConfig
              → setResolvedConfig → websiteConfig everywhere
```

The same values are translated by `settingsToServerEnv` into a `RuntimeEnv` (keeping the env
variable names), stored on the per-request `ServerContext` for payment / mail / notification
consumers.

## Admin tabs

Settings are organised as nine tabs. Each tab has **one Save button** at the top and submits
every group in that tab, including collapsed ones. Group cards can be collapsed individually;
collapsing is a view state and does not affect saving. Switching tabs keeps unsaved drafts,
and saving one tab leaves drafts in the other tabs untouched.

| Tab | Group | Content |
|---|---|---|
| General & Appearance | Brand | Site name, tagline, accented glyph in the wordmark |
| General & Appearance | SEO | Default title / description / keywords, plus per-locale overrides |
| General & Appearance | Social | 11 platform URLs; invalid or credential-bearing URLs are dropped |
| Users | User center features | Entry switches (`userFeatures.*`): billing, manual payments, API keys, notification preferences |
| Users | Registration | Default role for new users (`user` / `viewer` / `editor`) and sign-up credits (enabled / amount / valid days / description) |
| Content | Content modules | docs / blog / changelog / contact switches |
| Content | Docs | External docs site URL and the "docs at the root path" switch |
| Auth & security | Sign-in methods | Email / Google / GitHub switches and the email-verification requirement |
| Auth & security | Google / GitHub / Turnstile | OAuth credentials and Turnstile site / secret keys |
| Payment | Payment modules | payment / manualPayments switches |
| Payment | Payment | Provider and checkout mode (`provider` / `manual_payments`) |
| Payment | Stripe / Creem | Provider keys and webhook secrets; Creem also has a product map and sandbox flag |
| Payment | Manual payments | Verification SLA and payee accounts (QR images live in the repo) |
| Email | Email modules | mail / newsletter switches |
| Email | Mail | Provider, support address, sender address |
| Email | Resend / Cloudflare Email | Provider credentials |
| Email | Newsletter | Newsletter provider (resend / beehiiv) and credentials |
| Analytics | Analytics modules | analytics switch |
| Analytics | Analytics | Multiple providers (GA / Plausible / Umami / Clarity) and their public IDs |
| Notification | Notification modules | notification switch |
| Notification | Notification | Provider (Discord / Feishu) and webhook URL |
| Custom | — | Arbitrary `custom.<key>` key-value rows, including secrets |

### Module switches vs user-center feature switches

Module switches decide whether a capability exists: when a module is off, its pages and APIs
return 404. User-center feature switches (`userFeatures.*`) only decide whether an **entry**
appears in the user center; they do not enable or disable the underlying module. For example,
`modules.payment` can be on while `userFeatures.billing` is off, which keeps the capability
but hides the billing page from users.

### Authentication has no master switch

`modules.auth` was removed. Authentication availability is decided by the three method
switches (`auth.emailEnabled` / `auth.googleEnabled` / `auth.githubEnabled`); at least one must
stay on. Saving a tab with all three off is rejected, so the admin cannot lock themselves out
through the UI. Directly editing the database can still disable every method — that remains an
operational risk.

### Custom settings are server-only

The **Custom** tab stores arbitrary keys that are not in the registry as `custom.<key>`. Key
format and reserved prefixes are validated, secret values are encrypted and masked like
registry secrets, and the panel fetches and saves its own table (whole-table replacement, not
per tab). Custom values do **not** enter the public `websiteConfig`; they are readable only on
the server through `getCustomSetting(key)`.

## Secrets at rest

Fields with `secret: true` are stored encrypted with AES-GCM:

- the key is derived from `CONFIG_ENCRYPTION_KEY` via `SHA-256`;
- the ciphertext is `enc:v1:` + base64(iv ‖ ciphertext);
- the admin only shows the last four characters (`••••••••ab12`); leaving the field blank
  keeps the current value;
- when `CONFIG_ENCRYPTION_KEY` is missing, groups containing secrets are rejected; public
  parameters can still be saved;
- if the key is lost or rotated, old ciphertexts cannot be decrypted and those fields fall
  back to their defaults — they must be re-entered.

Never store `CONFIG_ENCRYPTION_KEY` next to the database backup. See
[Environment variables](./environment).

## Resolution order

1. A stored field wins;
2. otherwise the registry default applies;
3. a field that fails validation (wrong type, bad URL) is dropped on its own — everything else
   still applies;
4. if any field in a group is invalid, that group's save is rejected and the stored values stay
   untouched.

The runtime snapshot has a 30-second TTL; the saving isolate refreshes immediately, others
follow within 30 seconds.

## Admin access

Entering the admin console requires **any** `admin.*` permission (`*` and the bare `admin`
permission also count). The check is `hasAdminAccess(permissions)`; it is not
`matchPermission('admin.*', permissions)`, which would reject holders of a concrete permission
such as `admin.content.read`. Users without admin access get a 404, not a 403, so the console's
existence is not disclosed.

Inside the console, menu items are filtered by their own permission: a user holding only
`admin.content.read` / `admin.tickets.read` sees the Content group but not Users, Roles, Audit,
Billing, Credits or Settings. A group whose items are all filtered out is not rendered. Each
server function repeats the same permission check, so hiding an entry is convenience, not the
security boundary.

## Gating

Module switches come only from configuration. When a module is off, its pages and APIs return
404 (APIs return `404 MODULE_DISABLED`). When it is on but required configuration is missing,
APIs return `503 SERVICE_UNAVAILABLE` while pages and navigation remain visible.

`getServiceStatuses()` labels each module `disabled` / `incomplete` / `configured` and reports
which fields are missing and where they belong (`环境变量` / `数据库配置` / `源码配置`).
The admin overview and `pnpm check` both consume that diagnosis.

`auth.requireEmailVerification` is a **security control**, not a mail toggle: downstream code
treats the email as an identity anchor (payment `customerEmail`, `ADMIN_EMAILS`). If
verification is required while mail is incomplete, `auth` reports `incomplete` and auth APIs
return 503 — it never silently downgrades to unverified sign-in.

## Structural values outside the registry

Some values are not exposed to the admin and stay in `src/config/website.ts`:

| Field | Purpose |
|---|---|
| `metadata.images.*` | OG image, light / dark logos, site icon |
| `ui.defaultTheme` / `enableThemeSwitch` / `themeColor` | Theme and address-bar colours |
| `landingOffer` | Which product and offer the landing CTA points at |
| `pages.waitlist` | Waitlist page switch |

`themeColor` must match `--background` in `styles/globals.css`: these values render outside
the page and cannot read CSS variables. Change both together.

Prices are never stored in configuration: the payment provider's price catalogue is the only
source, used by both the landing page and checkout. `landingOffer` must reference a product
and offer declared in `src/config/products.ts`.

## Seeding

```bash
pnpm db:setup
pnpm db:seed           # registry defaults + values from .env
```

`db:seed` only fills missing fields (`DO NOTHING`) so admin edits survive; pass `--force` to
overwrite everything. It also deletes keys that are no longer in the registry.

### Upgrading from an older release

`features.*` and `modules.auth` are gone. An existing installation may still hold rows for
them; they are ignored at runtime, but removing them keeps the table honest:

```bash
pnpm db:cleanup:settings          # local D1
pnpm db:cleanup:settings:remote   # remote D1
```

The script deletes only the `features.*` keys and `modules.auth`, leaving all other settings
untouched. Run it once after deploying an upgrade that crosses this change.

To change the brand and support address, use `--brand` / `--tagline` / `--email`, or edit them
in the admin.