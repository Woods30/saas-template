/**
 * 首次触达归因：从请求 URL / cookie / 请求头提取渠道信息，注册时写进用户行。
 *
 * 归因只写一次：写入方只在「cookie 不存在」时下发，读取方在落库前再次清洗。
 * 空串表示未归因——不区分「取不到」与「取到空值」，漏斗统计不必处理 NULL 分支。
 *
 * 纯逻辑模块：不读 env、不读数据库，便于单测。
 */

import { parseAcceptLanguage, readCookieValue } from '@/lib/locale'

/** UTM 参数与同名 cookie 的键，顺序即 `Set-Cookie` 的下发顺序。 */
export const UTM_COOKIE_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const

/** 首次外部来源 cookie。 */
export const REFERRER_COOKIE = 'first_referrer'

/** UTM 值只保留字母数字与 `._-`，并且最多 100 字符。 */
const UTM_MAX_LENGTH = 100

/** referrer 是完整 URL，上限放宽到 500；伪造 cookie 也不能把大段文本写进用户行。 */
const REFERRER_MAX_LENGTH = 500

/** IP 头的合理上限：IPv6 最长 45 字符，留出转发链噪声的余量。 */
const IP_MAX_LENGTH = 64

/** 30 天，与归因窗口一致。 */
const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/** `Max-Age` 在前，便于测试与日志里直接比对。 */
const ATTRIBUTION_COOKIE_ATTRIBUTES = `Max-Age=${ATTRIBUTION_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`

const UTM_ALLOWED_PATTERN = /[^A-Za-z0-9._-]/g
const COUNTRY_PATTERN = /^[A-Z]{2}$/
const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

interface Attribution {
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmTerm: string
  utmContent: string
  referrer: string
  country: string
  ip: string
  locale: string
}

/** 清洗 UTM 值：保留字母数字与 `._-`，截断到 100。 */
export function sanitizeUtm(value: string): string {
  return value.replace(UTM_ALLOWED_PATTERN, '').slice(0, UTM_MAX_LENGTH)
}

/**
 * 清洗 referrer：去掉 query / hash / 凭据，只保留 http(s) 来源。
 *
 * `selfHosts` 内的 host（含其子域）视为站内跳转，返回空串——站内导航不是外部触达。
 */
export function sanitizeReferrer(value: string, selfHosts: string[] = []): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    // 相对地址或任意非 URL 文本都不构成外部来源。
    return ''
  }

  if (!HTTP_PROTOCOLS.has(parsed.protocol)) return ''

  const hostname = normalizeHostname(parsed.hostname)
  if (hostname && selfHosts.some((host) => isSameSite(hostname, host))) return ''

  parsed.username = ''
  parsed.password = ''
  parsed.search = ''
  parsed.hash = ''

  const pathname = parsed.pathname === '/' ? '' : parsed.pathname
  return `${parsed.protocol}//${parsed.host}${pathname}`.slice(0, REFERRER_MAX_LENGTH)
}

/** `cf-ipcountry` 归一为大写两位国家码；`XX` 与非法值返回空串。 */
export function getCountryFromHeaders(headers: Headers): string {
  const country = headers.get('cf-ipcountry')?.trim().toUpperCase() ?? ''
  if (country === 'XX' || !COUNTRY_PATTERN.test(country)) return ''
  return country
}

/** 真实客户端 IP：优先 Cloudflare 注入的 `cf-connecting-ip`，其次转发链首段。 */
export function getClientIpFromHeaders(headers: Headers): string {
  const direct = headers.get('cf-connecting-ip')?.trim()
  if (direct) return direct.slice(0, IP_MAX_LENGTH)

  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded ? forwarded.slice(0, IP_MAX_LENGTH) : ''
}

/** 从 `Accept-Language` 猜测受支持的语言；复用 `src/lib/locale.ts` 的解析。 */
export function guessLocaleFromAcceptLanguage(value: string | null): string {
  return parseAcceptLanguage(value) ?? ''
}

/**
 * 生成归因 cookie 的 `Set-Cookie` 值。
 *
 * - UTM：URL 带参数且请求里没有同名 cookie 时写入；清洗后为空则不写，
 *   避免一个空 cookie 永久挡住后续有效归因。
 * - referrer：仅首次 GET HTML 导航写入，且外部来源才写。
 */
export function attributionCookieHeaders(request: Request): string[] {
  const cookieHeader = request.headers.get('cookie')
  const url = new URL(request.url)
  const cookies: string[] = []

  for (const key of UTM_COOKIE_KEYS) {
    const value = url.searchParams.get(key)
    if (value === null) continue
    if (hasCookieValue(cookieHeader, key)) continue
    const sanitized = sanitizeUtm(value)
    if (!sanitized) continue
    cookies.push(`${key}=${sanitized}; ${ATTRIBUTION_COOKIE_ATTRIBUTES}`)
  }

  if (shouldWriteReferrer(request, cookieHeader)) {
    const referrer = sanitizeReferrer(request.headers.get('referer') ?? '', [url.hostname])
    if (referrer) {
      cookies.push(
        `${REFERRER_COOKIE}=${encodeURIComponent(referrer)}; ${ATTRIBUTION_COOKIE_ATTRIBUTES}`,
      )
    }
  }

  return cookies
}

/**
 * 从请求 cookie / 请求头读取归因。
 *
 * cookie 是客户端可伪造输入：每个值都先解码再按写入时的规则清洗，
 * 超长、非法百分号编码与标签片段都不会原样落库。
 */
export function readAttribution(headers: Headers): Attribution {
  const cookieHeader = headers.get('cookie')
  const readUtm = (key: string): string => {
    const raw = readCookieValue(cookieHeader, key)
    return raw === undefined ? '' : sanitizeUtm(decodeCookieValue(raw))
  }

  // 同站来源在写入侧会被过滤；读取时也按同一规则清洗，伪造 `first_referrer` 同样失效。
  const host = headers.get('host')
  const selfHosts = host ? [host] : []
  const referrerRaw = readCookieValue(cookieHeader, REFERRER_COOKIE)
  const referrer =
    referrerRaw === undefined || referrerRaw === ''
      ? ''
      : sanitizeReferrer(decodeCookieValue(referrerRaw), selfHosts)

  return {
    utmSource: readUtm('utm_source'),
    utmMedium: readUtm('utm_medium'),
    utmCampaign: readUtm('utm_campaign'),
    utmTerm: readUtm('utm_term'),
    utmContent: readUtm('utm_content'),
    referrer,
    country: getCountryFromHeaders(headers),
    ip: getClientIpFromHeaders(headers),
    locale: guessLocaleFromAcceptLanguage(headers.get('accept-language')),
  }
}

/**
 * 把归因 cookie 合进响应。
 *
 * `attributionCookieHeaders` 自己判断「同名 cookie 是否已存在」，因此这里只负责复制
 * 响应头并逐条 `append('Set-Cookie', ...)`——中间件返回的响应头可能是不可变的。
 * body 原样透传：SSR 是流式响应，不能读取后再重建文本。
 */
export function withAttributionCookies(response: Response, request: Request): Response {
  const cookies = attributionCookieHeaders(request)
  if (cookies.length === 0) return response

  const headers = new Headers(response.headers)
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function shouldWriteReferrer(request: Request, cookieHeader: string | null): boolean {
  if (request.method !== 'GET') return false
  if (!request.headers.get('accept')?.toLowerCase().includes('text/html')) return false
  return !hasCookieValue(cookieHeader, REFERRER_COOKIE)
}

/**
 * cookie 是否存在**有效**值。
 *
 * 空值（`utm_source=`）与「解码 + 清洗后为空」（`utm_source=%20`）都与缺失同等看待：
 * 读取侧把这类值映射为「未归因」，写入侧若把它当作「已存在」，一个伪造/历史空 cookie
 * 就会永久挡住后续有效参数（30 天窗口）。
 */
function hasCookieValue(cookieHeader: string | null, name: string): boolean {
  const raw = readCookieValue(cookieHeader, name)
  if (raw === undefined) return false
  const decoded = decodeCookieValue(raw)
  const sanitized = name === REFERRER_COOKIE ? sanitizeReferrer(decoded) : sanitizeUtm(decoded)
  return sanitized !== ''
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    // 非法百分号编码保留原文，由后续清洗剔除非法字符。
    return value
  }
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

/** `selfHost` 可以是裸 host 或完整 URL；子域视为同站。 */
function isSameSite(hostname: string, selfHost: string): boolean {
  const trimmed = selfHost.trim()
  if (!trimmed) return false

  let normalized: string
  try {
    normalized = normalizeHostname(new URL(trimmed).hostname)
  } catch {
    try {
      // `host` 头没有协议（`example.com:3000`），补一个 scheme 让 URL 解析端口与 IPv6。
      normalized = normalizeHostname(new URL(`http://${trimmed}`).hostname)
    } catch {
      normalized = normalizeHostname(trimmed.split(':')[0] ?? '')
    }
  }

  if (!normalized) return false
  return hostname === normalized || hostname.endsWith(`.${normalized}`)
}
