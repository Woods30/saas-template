/**
 * Known analytics & third-party origins allowed in CSP connect-src.
 *
 * Additions must be reviewed against the actual network requests the SDK makes;
 * placeholder/example domains must never be added.
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
 * These must appear in `script-src`: the injected `<script src>` tags are external,
 * so the nonce cannot cover them. Umami is self-hosted and its URL cannot be
 * enumerated here — see `getAnalyticsScriptOrigins`.
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
 * `script-src` omits `'unsafe-inline'` and `'unsafe-eval'`; the nonce allowlist is
 * the only inline path.
 *
 * @param nonce - Unique per-request base64-encoded value from generateNonce()
 * @param analyticsScriptOrigins - Extra `script-src` origins for providers enabled on
 *   this request. Must come from `getAnalyticsScriptOrigins()` so only actually
 *   injected scripts are allowed.
 */
export function buildCspHeader(
  nonce: string,
  analyticsScriptOrigins: readonly string[] = [],
): string {
  const self = `'self'`
  const nonceSrc = `'nonce-${nonce}'`
  const unsafeInline = "'unsafe-inline'"

  const connectSrc = [self, ...KNOWN_THIRD_PARTY_ORIGINS, 'data:', 'blob:'].join(' ')

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
    `script-src ${scriptSrc}`,
    // Tailwind v4 injects per-element style attributes; scoped to style-src only.
    `style-src ${self} ${unsafeInline}`,
    `img-src ${self} data: https://*.googleusercontent.com`,
    `font-src ${self} https://fonts.gstatic.com`,
    `connect-src ${connectSrc}`,
    // Stripe Elements iframe (card tokenization).
    `frame-src https://js.stripe.com`,
    `frame-ancestors 'none'`,
    `base-uri ${self}`,
    `form-action ${self}`,
  ].join('; ')
}

/**
 * Generate a cryptographically random nonce suitable for CSP script-src.
 *
 * Uses `crypto.randomUUID()` converted to URL-safe base64. Must be regenerated
 * per request.
 *
 * @returns A URL-safe base64-encoded string (22 characters) used as the CSP nonce.
 */
export function generateNonce(): string {
  const hex = crypto.randomUUID().split('-').join('')
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
 * React 19's SSR `nonce` option only covers scripts the renderer emits; TanStack
 * Router's streaming bootstrap and cleanup scripts are serialized outside the
 * React tree, so they need this post-process step.
 *
 * Streaming-safe: tags that span chunk boundaries are buffered until the `>`.
 *
 * @param response - Original response whose body will be re-streamed
 * @param nonce - Per-request CSP nonce already placed in the CSP header
 * @returns A new Response with the same status / headers but a transformed body
 */
export function addNonceToInlineScripts(response: Response, nonce: string): Response {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().includes('text/html')) {
    return response
  }
  if (!response.body) return response

  const decoder = new TextDecoder('utf-8')
  const encoder = new TextEncoder()
  let buffer = ''

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const flushed = drainCompleteScriptTags(buffer, nonce)
      buffer = flushed.remainder
      if (flushed.output) controller.enqueue(encoder.encode(flushed.output))
    },
    flush(controller) {
      // `stream: false` flushes the decoder state.
      buffer += decoder.decode()
      const flushed = drainCompleteScriptTags(buffer, nonce, { finalize: true })
      if (flushed.output) controller.enqueue(encoder.encode(flushed.output))
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
 * Scan a buffer for complete `<script …>` opening tags and add the CSP nonce to
 * inline ones. Returns the rewritten text and the unprocessed remainder.
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
    output += text.slice(lastIndex, tagStart)

    const rewritten = rewriteScriptTag(tag, nonce)
    output += rewritten
    lastIndex = tagStart + tag.length
    match = TAG_RE.exec(text)
  }

  const remainder = options.finalize ? '' : text.slice(lastIndex)
  // On finalize, emit trailing text too so we never drop bytes.
  if (options.finalize) output += text.slice(lastIndex)
  return { output, remainder }
}

/** Add the CSP nonce to a single inline `<script …>` tag; other tags pass through. */
function rewriteScriptTag(tag: string, nonce: string): string {
  if (/\bsrc\s*=/i.test(tag)) return tag
  if (/\bnonce\s*=/i.test(tag)) return tag
  // Non-executable JSON-family types are not blocked by script-src, and adding a
  // nonce would cause a hydration mismatch with React's `JsonLd` component.
  if (/\btype\s*=\s*["'](?:application\/(?:ld\+)?json|text\/plain)["']/i.test(tag)) {
    return tag
  }

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
 * 必须与 `initAnalytics()` 的注入清单保持一致：只给**真的会注入脚本**的 provider 放行。
 * Umami 自托管，origin 需从 `VITE_UMAMI_SCRIPT_URL` 逐请求推导。
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

  if (selected.has('ga') && publicEnv.VITE_GA_ID) {
    origins.push('https://www.googletagmanager.com')
  }
  if (selected.has('plausible') && publicEnv.VITE_PLAUSIBLE_DOMAIN) {
    origins.push('https://plausible.io')
  }
  if (
    selected.has('umami') &&
    (publicEnv.VITE_UMAMI_WEBSITE_ID ?? publicEnv.VITE_UMAMI_ID) &&
    publicEnv.VITE_UMAMI_SCRIPT_URL
  ) {
    try {
      const url = new URL(publicEnv.VITE_UMAMI_SCRIPT_URL)
      origins.push(url.origin)
    } catch {
      // 不向 CSP 写入来源不明的字符串。
    }
  }
  if (selected.has('clarity') && (publicEnv.VITE_CLARITY_PROJECT_ID ?? publicEnv.VITE_CLARITY_ID)) {
    origins.push('https://www.clarity.ms')
  }

  return [...new Set(origins)]
}
