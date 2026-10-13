import { publicEnv } from '@/env/public'
import { websiteConfig } from '@/config/website'

/**
 * Known analytics & third-party origins allowed in CSP connect-src.
 * Each entry is a string used as a CSP keyword ('self', 'none') or origin prefix.
 *
 * Origin derivation rules:
 * - 'self'         → 'self' keyword (own origin, resolved at build-time via baseUrl)
 * - 'none'         → 'none' keyword (block all)
 * - *.domain       → https://*.domain (wildcard matches any subdomain)
 * - exact domain   → https://exact.domain
 *
 * Additions must be reviewed: do NOT add origins without verifying the actual
 * network requests the corresponding SDK makes. Placeholder/example domains
 * (e.g. umami.example.com) must never be added.
 *
 * Last reviewed against:
 *   src/lib/analytics/index.ts     — Plausible, GA/GTM, Umami, Clarity script injections
 *   src/payment/provider/stripe.ts — Stripe.js tokenization
 *   src/lib/rate-limit.ts           — no external calls (KV only)
 *   src/mail/provider/resend.ts     — no browser-side calls (server-side API key)
 */
const KNOWN_THIRD_PARTY_ORIGINS = [
  // Stripe — payment tokenization (stripe.js loads from *.stripe.com)
  'https://*.stripe.com',
  // Plausible analytics — script from plausible.io
  'https://plausible.io',
  // Google Analytics / GTM — gtag/js loads from www.googletagmanager.com
  'https://www.googletagmanager.com',
  // Microsoft Clarity — tag loader from www.clarity.ms
  'https://www.clarity.ms',
  // Umami — self-hosted or cloud.umami.is; *.umami.is covers cloud
  'https://*.umami.is',
] as const

/**
 * Build the Content-Security-Policy header value for a given nonce.
 *
 * Directives:
 *   default-src    — fallback for unset directives ('self' only, no inline/bync default)
 *   script-src     — 'self' + nonce (SSR inline scripts use nonce); excludes 'unsafe-inline'
 *   style-src      — 'self' + 'unsafe-inline' (Tailwind per-element style injection)
 *   img-src        — 'self' + data: + https://*.googleusercontent.com (profile photos)
 *   font-src       — 'self' + https://fonts.gstatic.com (Google Fonts)
 *   connect-src    — 'self' + analytics origins + stripe + data:
 *   frame-src      — 'self' + https://js.stripe.com (Stripe Elements iframe)
 *   frame-ancestors— 'none' (clickjacking protection)
 *   base-uri       — 'self' (prevent DOM base hijacking)
 *   form-action    — 'self' (restrict form submission destinations)
 *
 * Security rationale:
 * - 'unsafe-inline' in script-src is omitted; nonce-based allowlist is stronger.
 * - 'unsafe-eval' is absent; no code-gen APIs used.
 * - frame-ancestors 'none' matches modern browser default; explicit for defense-in-depth.
 *
 * @param nonce - Unique per-request base64-encoded value from generateNonce()
 */
export function buildCspHeader(nonce: string): string {
  const self = `'self'`
  const nonceSrc = `'nonce-${nonce}'`
  const unsafeInline = "'unsafe-inline'"

  // Resolve own origin from build-time baseUrl to avoid hardcoding a specific URL.
  // Trailing slash is stripped so the string is suitable as a CSP origin token.
  const selfOrigin = websiteConfig.baseUrl.replace(/\/$/, '')

  const connectSrc = [
    self,
    ...KNOWN_THIRD_PARTY_ORIGINS,
    // data: URIs for inline images (e.g. SVG data URIs in HTML)
    'data:',
    // blob: for workers
    'blob:',
  ].join(' ')

  return [
    `default-src ${self}`,
    // Inline scripts (SSR hydration, analytics init) use the nonce; no raw unsafe-inline.
    `script-src ${self} ${nonceSrc}`,
    // Tailwind v4 injects per-element style attributes; 'unsafe-inline' is required for
    // Tailwind's CSS-in-JS approach to function. This is scoped to style-src, not script-src.
    `style-src ${self} ${unsafeInline}`,
    // Images: own origin, data: URIs, and Google profile photo CDN.
    `img-src ${self} data: https://*.googleusercontent.com`,
    // Fonts: own origin and Google Fonts static delivery.
    `font-src ${self} https://fonts.gstatic.com`,
    `connect-src ${connectSrc}`,
    // Stripe Elements iframe (card tokenization).
    `frame-src https://js.stripe.com`,
    `frame-ancestors 'none'`,
    `base-uri ${self}`,
    `form-action ${self}`,
    // Report-URI is no longer recommended (CSP Level 3 deprecates it); omit.
  ].join('; ')
}

/**
 * Generate a cryptographically random nonce suitable for CSP script-src.
 *
 * Uses `crypto.randomUUID()` (UUID v4 via Web Crypto API) converted to a
 * URL-safe base64 string. This is the recommended approach for Workers/Runtime
 * environments that expose the standard `crypto` global.
 *
 * The nonce is unique per request and must be regenerated for each response.
 *
 * @returns A URL-safe base64-encoded string (22 characters) used as the CSP nonce.
 */
export function generateNonce(): string {
  // UUID v4 → strip dashes → base64url encode
  const uuid = crypto.randomUUID()
  const bytes = new Uint8Array(
    uuid.split('-').join('').match(/.{2}/g)!.map((h) => parseInt(h, 16)),
  )
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}
