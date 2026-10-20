---
title: Privacy Policy
locale: en
---

We respect your privacy. This policy describes what information this template touches, what it is used for, and what choices you have.

> **Note**: This document is **template placeholder content** and is not legal advice. Every item marked "fill in before deploying" must be replaced with the facts of your actual deployment before you publish it — a privacy policy that does not match reality is worse than none.

## What we collect

Account-related information is collected only to identify you and keep you signed in: your email address, the credentials used to sign in, and the display name you choose. Passwords are not stored in readable form.

When you use features that require payment, the charge is handled by Stripe. We never see or store your full card number.

> **Note**: Fill in before deploying — if your deployment actually enables analytics, the newsletter, or file uploads, add the fields each of them collects here and remove the "not enabled" wording above. These switches live in `src/config/website.ts`.

## How we use it

The information is used only to: verify sign-in, maintain your session, reset your password when you ask, and grant the entitlements you purchased.

We do not sell your information, and we do not use it for profiling unrelated to the purposes above.

## Sharing and third parties

Information is passed to third parties only when needed to keep the service running. The categories this template can integrate with are listed below; which ones are active depends on your configuration.

| Category | Purpose | Config key |
|---|---|---|
| Mail | Send verification codes, password resets, notifications | `mail` |
| Payments | Process subscriptions and refunds | `payment` |
| Newsletter | Manage the subscriber list | `newsletter` |
| Notifications | Deliver operational alerts | `notification` |

> **Note**: Fill in before deploying — remove the rows you have not enabled, and for each service you do use, add the provider name, its region, and a link to its data processing agreement (DPA). Users need to know when their data leaves this site.

## Cookies and local storage

This site sets only what is required to function: a session cookie that keeps you signed in, a cookie that remembers your language choice, and local storage that remembers your light/dark preference. None of these are used for cross-site tracking.

> **Note**: Fill in before deploying — if you add third-party analytics or marketing scripts, their cookies must be listed here one by one (name, purpose, lifetime). A policy that omits cookies you actually set directly affects compliance.

## Your choices and rights

You can change your display name and email in your profile, change your password or delete your account from the Security page, and revoke sessions on other devices from the Login Devices page.

You can also request an export of your data, or ask us to delete it.

> **Note**: Fill in before deploying — if you are located in, or target users in, jurisdictions with specific data-protection regimes such as the EU or California, state the corresponding rights here (access, rectification, erasure, portability, objection), along with the channel for making a request and the response deadline.

## Contact us

For any question about privacy, contact: `<fill in contact email before deploying>`

> **Note**: Fill in the contact email and make sure someone monitors it. The value already configured at `websiteConfig.mail.supportEmail` is a reasonable choice.
