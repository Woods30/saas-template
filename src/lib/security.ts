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
  // GA / GTM measurement uploads (RegExp-based allowlist rules additionally match
  // https://*.google-analytics.com and https://*.analytics.google.com below).
] as const

/**
 * Script origins loaded by `initAnalytics()`.
 *
 * These must appear in `script-src` — the injected `<script src>` tags are external
 * (`document.createElement('script')` in `injectScript`), so they are covered by the
 * origin expression in `script-src`, not by the nonce. Under the previous
 * `script-src 'self' 'nonce-…'` policy every production analytics script was
 * blocked by the browser, which no test caught because only `connect-src` was
 * asserted.
 *
 * Umami is self-hosted, so its script URL comes from `VITE_UMAMI_SCRIPT_URL` and
 * cannot be enumerated here; see the per-request CSP assembly in `getCspScriptSrc`
 * for how that case is handled.
 */
const ANALYTICS_SCRIPT_ORIGINS = [
  // Google Analytics / GTM — gtag/js
  'https://www.googletagmanager.com',
  // Plausible
  'https://plausible.io',
  // Microsoft Clarity
  'https://www.clarity.ms',
] as const

/**
 * Build the Content-Security-Policy header value for a given nonce.
 *
 * Directives:
 *   default-src    — fallback for unset directives ('self' only, no inline/bync default)
 *   script-src     — 'self' + nonce + analytics script origins
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
 * @param analyticsScriptOrigins - Extra origins appended to `script-src` for the
 *   analytics providers enabled on this request. Must be built from
 *   `getAnalyticsScriptOrigins()` so only actually-injected scripts are allowed;
 *   an empty list yields the strict `'self' 'nonce-…'` policy.
 */
export function buildCspHeader(
  nonce: string,
  analyticsScriptOrigins: readonly string[] = [],
): string {
  const self = `'self'`
  const nonceSrc = `'nonce-${nonce}'`
  const unsafeInline = "'unsafe-inline'"

  const connectSrc = [
    self,
    ...KNOWN_THIRD_PARTY_ORIGINS,
    // data: URIs for inline images (e.g. SVG data URIs in HTML)
    'data:',
    // blob: for workers
    'blob:',
  ].join(' ')

  // Externally-loaded analytics scripts need their origin in script-src. The nonce
  // cannot cover them: `injectScript()` creates the element imperatively at
  // runtime, well after the server serialised the nonce into the HTML document.
  const scriptSrc = [
    self,
    nonceSrc,
    ...ANALYTICS_SCRIPT_ORIGINS,
    ...analyticsScriptOrigins.filter(
      (origin) => !ANALYTICS_SCRIPT_ORIGINS.includes(origin as never),
    ),
  ].join(' ')

  return [
    `default-src ${self}`,
    // Inline scripts (SSR hydration, analytics init) use the nonce; no raw unsafe-inline.
    // External analytics script origins are added per request — see above.
    `script-src ${scriptSrc}`,
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
  const hex = crypto.randomUUID().split('-').join('')
  // A UUID v4 always has an even number of hex digits, so pairs are always present.
  const bytePairs = hex.match(/.{2}/g) ?? []
  const bytes = new Uint8Array(bytePairs.map((h) => parseInt(h, 16)))
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

  let match = TAG_RE.exec(text)
  while (match !== null) {
    const tag = match[0]
    const tagStart = match.index
    // Always copy text between previous match and this one verbatim.
    output += text.slice(lastIndex, tagStart)

    const rewritten = rewriteScriptTag(tag, nonce)
    output += rewritten
    lastIndex = tagStart + tag.length
    match = TAG_RE.exec(text)
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

/**
 * 计算本次请求需要放进 `script-src` 的分析脚本 origin。
 *
 * 与 `initAnalytics()` 的注入清单保持一致：只给**真的会注入脚本**的 provider 放行，
 * 不为未启用的 provider 预留。Umami 是自托管的，脚本地址来自
 * `VITE_UMAMI_SCRIPT_URL`，因此这里要显式取出其 origin——写在
 * `ANALYTICS_SCRIPT_ORIGINS` 里只会是占位域名。
 *
 * 本函数在 CSP 拼装处（`src/server.ts`）调用，不需要浏览器环境。
 */
export function getAnalyticsScriptOrigins(input: {
  analytics: { enabled: boolean; providers: readonly string[] }
  publicEnv: {
    VITE_GA_ID?: string
    VITE_PLAUSIBLE_DOMAIN?: string
    VITE_UMAMI_WEBSITE_ID?: string
    VITE_UMAMI_ID?: string
    VITE_UMAMI_SCRIPT_URL?: string
    VITE_CLARITY_PROJECT_ID?: string
    VITE_CLARITY_ID?: string
  }
}): string[] {
  const { analytics, publicEnv } = input
  if (!analytics.enabled) return []

  const selected = new Set(analytics.providers)
  const origins: string[] = []

  // GA 选中且有 ID → 会注入 googletagmanager.com/gtag/js
  if (selected.has('ga') && publicEnv.VITE_GA_ID) {
    origins.push('https://www.googletagmanager.com')
  }
  // Plausible 选中且有 domain → 会注入 plausible.io/js/script.js
  if (selected.has('plausible') && publicEnv.VITE_PLAUSIBLE_DOMAIN) {
    origins.push('https://plausible.io')
  }
  // Umami 选中且 ID 与脚本 URL 都齐 → 注入该 URL（origin 自托管，逐请求推导）
  if (
    selected.has('umami') &&
    (publicEnv.VITE_UMAMI_WEBSITE_ID ?? publicEnv.VITE_UMAMI_ID) &&
    publicEnv.VITE_UMAMI_SCRIPT_URL
  ) {
    try {
      const url = new URL(publicEnv.VITE_UMAMI_SCRIPT_URL)
      origins.push(url.origin)
    } catch {
      // URL 非法时 `publicEnv` 的 Zod 校验早已在更早的阶段失败；这里静默跳过，
      // 不向 CSP 写入来源不明的字符串。
    }
  }
  // Clarity 选中且有 project ID → 会注入 clarity.ms/tag/…
  if (selected.has('clarity') && (publicEnv.VITE_CLARITY_PROJECT_ID ?? publicEnv.VITE_CLARITY_ID)) {
    origins.push('https://www.clarity.ms')
  }

  // 去重：同一 origin 可能由多个 provider 命中（例如 GA 与 Clarity 都启用时不会有，
  // 但自托管 Umami 的 origin 理论上可能与其他项重合）。
  return [...new Set(origins)]
}
