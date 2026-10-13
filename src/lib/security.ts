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

/**
 * Rewrap a streaming Response body so every inline `<script>` tag carries the
 * CSP nonce.
 *
 * TanStack Router's streaming SSR emits two classes of inline script that
 * React itself does not own:
 *  - `<script data-tsr-stream-part="…">` — the bootstrap that populates
 *    `window.$_TSR` for client hydration
 *  - `<script>` (close-out cleanup) — the trailing post-render script
 *
 * React 19's SSR `nonce` option is plumbed only for scripts the renderer
 * itself emits. Router's streaming bootstrap and cleanup scripts are
 * serialized outside the React tree, so they need a post-process step.
 *
 * The transform operates on UTF-8 chunks: each chunk is decoded, scanned for
 * `<script …>` opening tags that lack both a `nonce=` attribute and a `src=`
 * attribute, and rewritten to include `nonce="…"` before the closing `>`.
 * `src=` scripts are external (already covered by `'self'`) and JSON-LD
 * `<script type="application/ld+json">` blocks are not executable, so both
 * are left alone.
 *
 * Streaming-safe: tags that span chunk boundaries are buffered until the
 * next chunk completes the `>`. The trailing tag in the final chunk is
 * flushed on stream close.
 *
 * @param response - Original response whose body will be re-streamed
 * @param nonce - Per-request CSP nonce already placed in the CSP header
 * @returns A new Response with the same status / headers but a transformed body
 */
export function addNonceToInlineScripts(response: Response, nonce: string): Response {
  // Skip for non-HTML responses (binary / JSON API responses, etc.).
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().includes('text/html')) {
    return response
  }
  if (!response.body) return response

  const decoder = new TextDecoder('utf-8')
  const encoder = new TextEncoder()
  // Buffer for tags that may straddle chunk boundaries; flushed once a `>` closes them.
  let buffer = ''

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      // Drain any complete `<script …>` tags; keep an incomplete tail in the buffer.
      const flushed = drainCompleteScriptTags(buffer, nonce)
      buffer = flushed.remainder
      if (flushed.output) controller.enqueue(encoder.encode(flushed.output))
    },
    flush(controller) {
      // Decode any final bytes with `stream: false` to flush the decoder state.
      buffer += decoder.decode()
      const flushed = drainCompleteScriptTags(buffer, nonce, { finalize: true })
      if (flushed.output) controller.enqueue(encoder.encode(flushed.output))
      // `remainder` here is an incomplete tag at EOF; emit unchanged so we don't
      // corrupt the final bytes of the document.
      if (flushed.remainder) controller.enqueue(encoder.encode(flushed.remainder))
      controller.terminate()
    },
  })

  return new Response(response.body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/**
 * Scan a buffer for complete `<script …>` opening tags and rewrite any inline
 * script tags to carry the given CSP nonce. Returns the rewritten text and the
 * unprocessed remainder (anything from the last unterminated `<script` to the
 * end of the buffer).
 *
 * Inline script = no `src=` attribute in the opening tag.
 * If the tag already has `nonce=`, it is left untouched.
 */
function drainCompleteScriptTags(
  text: string,
  nonce: string,
  options: { finalize?: boolean } = {},
): { output: string; remainder: string } {
  const TAG_RE = /<script\b[^>]*>/gi
  let output = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = TAG_RE.exec(text)) !== null) {
    const tag = match[0]
    const tagStart = match.index
    // Always copy text between previous match and this one verbatim.
    output += text.slice(lastIndex, tagStart)

    const rewritten = rewriteScriptTag(tag, nonce)
    output += rewritten
    lastIndex = tagStart + tag.length
  }

  // Anything after the last `>` is "remainder" — the buffer for the next chunk
  // (or the final partial tag at EOF when `finalize: true`). When there is no
  // match at all, `lastIndex` is still 0 and `text` itself is the remainder.
  const remainder = options.finalize ? '' : text.slice(lastIndex)
  // On finalize, emit any text that came after the last match (including
  // closing tags like `</script>`, body markup, etc.) so we never drop bytes.
  if (options.finalize) output += text.slice(lastIndex)
  return { output, remainder }
}

/**
 * Rewrite a single `<script …>` opening tag to include the CSP nonce if it is
 * an inline script and does not already have one. Returns the tag unchanged
 * otherwise.
 */
function rewriteScriptTag(tag: string, nonce: string): string {
  // External script (has src=) — already allowed by 'self'; no rewrite.
  if (/\bsrc\s*=/i.test(tag)) return tag
  // Already has a nonce — leave as-is.
  if (/\bnonce\s*=/i.test(tag)) return tag
  // Non-executable script types (JSON-LD, application/json, etc.) are data,
  // not JavaScript. CSP `script-src` does not block them, so adding a nonce
  // would (a) be unnecessary and (b) create a server/client hydration mismatch
  // because React's `JsonLd` component emits the tag without a nonce attribute.
  // Only skip the JSON-family types — unknown / future types are left alone so
  // the browser's CSP implementation remains the source of truth.
  if (/\btype\s*=\s*["'](?:application\/(?:ld\+)?json|text\/plain)["']/i.test(tag)) {
    return tag
  }

  // Insert nonce before the closing `>`. `<script>` becomes `<script nonce="…">`.
  // `<script attr="x">` becomes `<script attr="x" nonce="…">`.
  const nonceAttr = `nonce="${nonce}"`
  return tag.replace(
    /^(<script\b)([^>]*)(>)$/i,
    (_full, head: string, attrs: string, close: string) => {
      const trimmed = attrs.trim()
      const attrPart = trimmed ? `${trimmed} ` : ''
      return `${head} ${attrPart}${nonceAttr}${close}`
    },
  )
}
