import { LOCALES } from '@/config/locale'

/**
 * 文档站独立部署时的地址换算。
 *
 * 内部路由始终是 `/{locale}/docs/...`（官网站关闭 docs 时不受影响）；文档站
 * （`docs.asHome`）对外要去掉 `/docs` 这一层，否则地址会变成
 * `docs.example.com/zh/docs/getting-started`，看起来像在文档站里又套了一个文档站。
 *
 * 换算分三处用：
 * - Router 的 `rewrite.input/output`：真实地址 ↔ 内部路由；
 * - canonical / sitemap / llms：输出对外地址；
 * - server entry：把历史 `/docs*` 地址 301 到新地址，避免同一内容两个 URL。
 */

const DOCS_SEGMENT = '/docs'

/**
 * 不参与重写的前缀。
 *
 * 接口与构建产物重写会直接坏掉；认证 / 工作台 / 营销页在文档站构建里虽然关闭，
 * 但保留排除项能让同一份代码在别的部署形态下也不会被误改。
 */
const EXCLUDED_PREFIXES = [
  '/api',
  '/assets',
  '/_build',
  '/.well-known',
  '/auth',
  '/admin',
  '/settings',
  '/marketing',
]

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/** 拆出语言前缀；没有前缀时 `locale` 为 `undefined`。 */
function splitLocale(pathname: string): { locale?: string; rest: string } {
  const segments = pathname.split('/')
  const first = segments[1] ?? ''
  if (first !== '' && (LOCALES as readonly string[]).includes(first)) {
    return { locale: first, rest: `/${segments.slice(2).join('/')}` }
  }
  return { rest: pathname }
}

/** 语言根路径：`/`、`/zh`、`/zh/`。 */
function isLocaleRoot(rest: string): boolean {
  return rest === '' || rest === '/'
}

function isDocsRest(rest: string): boolean {
  return rest === DOCS_SEGMENT || rest.startsWith(`${DOCS_SEGMENT}/`)
}

/** 最后一段带扩展名的是静态文件（`/favicon.ico`、`/llms.txt`、`/sitemap.xml`）。 */
function hasFileExtension(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  return last.includes('.')
}

function join(locale: string | undefined, rest: string): string {
  const prefix = locale ? `/${locale}` : ''
  return rest === '/' ? prefix || '/' : `${prefix}${rest}`
}

/**
 * 文档页的对外路径（不含语言前缀）。
 *
 * @param slug - 文档 slug；省略表示文档首页。
 * @param asHome - 本构建是否就是文档站。
 */
export function docsPublicPath(slug: string | undefined, asHome: boolean): string {
  // 首页在文档站模式下就是站点根：返回空串，交给调用方拼语言前缀，
  // 这样 canonical 与 sitemap 都得到 `/zh`，不会多出尾斜杠。
  if (asHome) return slug ? `/${slug}` : ''
  return slug ? `${DOCS_SEGMENT}/${slug}` : DOCS_SEGMENT
}

/**
 * 输入重写：把真实地址补成内部路由。
 *
 * 语言根（`/zh`）要补成 `/zh/docs`，否则会落回营销首页的路由，再被它重定向回
 * `/zh`，形成自跳转。站点根 `/` 不处理——那里由根路由按 cookie / Accept-Language
 * 决定语言，提前补 `/docs` 会把语言协商绕过去。
 */
export function rewriteDocsInput(pathname: string, asHome: boolean): string | undefined {
  if (!asHome || isExcluded(pathname)) return undefined
  const { locale, rest } = splitLocale(pathname)
  if (isDocsRest(rest) || hasFileExtension(rest)) return undefined
  if (isLocaleRoot(rest)) {
    // `/` 没有语言前缀，交给根路由做语言协商；`/zh`、`/zh/` 直接进文档首页。
    return locale ? join(locale, DOCS_SEGMENT) : undefined
  }
  return join(locale, `${DOCS_SEGMENT}${rest}`)
}

/** 输出重写：把内部路由去掉 `/docs`，用于生成链接与提交历史。 */
export function rewriteDocsOutput(pathname: string, asHome: boolean): string | undefined {
  if (!asHome) return undefined
  const { locale, rest } = splitLocale(pathname)
  if (!isDocsRest(rest)) return undefined
  const stripped = rest.slice(DOCS_SEGMENT.length)
  return join(locale, stripped === '' ? '/' : stripped)
}

/** 历史 `/docs*` 地址的重定向目标；不是这类地址时返回 `undefined`。 */
export function docsLegacyRedirect(pathname: string, asHome: boolean): string | undefined {
  return rewriteDocsOutput(pathname, asHome)
}
