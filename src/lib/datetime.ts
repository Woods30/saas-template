/**
 * 日期与时区：**后端统一 UTC，前端渲染才用本地时区**。
 *
 * 分三层约定：
 *
 * 1. **存储与计算一律 UTC**。Drizzle 的 `timestamp` 列存 Unix 秒（`unixepoch()`），
 *    结算周期用 `Date.UTC` / `getUTC*` 推算，见 `src/db/schema.ts` 与
 *    `src/collection/settlement.ts`。后端代码不得使用本地时区读取器
 *    （`getFullYear` / `getMonth` / …）。
 * 2. **格式化只在这里做**。全仓的 `toLocale*` 调用集中在本模块，其余业务代码一律
 *    调用这里的函数；`tests/unit/datetime-guard.test.ts` 守着这条线。
 * 3. **SSR 与浏览器首帧用 UTC，浏览器挂载后切本地时区**。服务端（Cloudflare
 *    Workers 运行时）固定 UTC，浏览器用用户本地时区；两端直接渲染同一份 HTML
 *    会在跨午夜差一天时触发 React 水合失败，整棵树重新生成、页面短暂不可交互。
 *    `<LocalDate>` 用 `useSyncExternalStore` 的 server snapshot 处理这一跳。
 *
 * 另外，**语言必须显式传入**：不传会落到运行时默认语言（Node 与浏览器往往不同），
 * 那是与时区无关的第二个水合失败来源。
 */

/** 可接受的日期输入：`Date`、Unix 毫秒数，或能被 `Date` 解析的字符串。 */
export type DateValue = Date | string | number | null | undefined

/** 日期时间的展示选项：到分钟，不带秒。 */
const DATE_TIME_OPTIONS = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
} as const

/**
 * 解析成 `Date`；空值与非法值返回 `null`。
 *
 * 不返回 `Invalid Date`——那会在界面上显示成 "Invalid Date" 文本。
 */
export function toDateValue(value: DateValue): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 按 UTC 输出日期（与服务器时区无关）。
 *
 * 用于「日历日」语义的值：文章发布日、更新日志日期等——它们记的是某一天，不是
 * 某个时刻。锁定 UTC 才能让西半球用户看到作者写下的那一天，而不是前一天。
 */
export function formatUtcDate(value: DateValue, locale: string): string {
  const date = toDateValue(value)
  return date ? date.toLocaleDateString(locale, { timeZone: 'UTC' }) : ''
}

/** 按 UTC 输出日期与时间。 */
export function formatUtcDateTime(value: DateValue, locale: string): string {
  const date = toDateValue(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale, { ...DATE_TIME_OPTIONS, timeZone: 'UTC' }).format(date)
}

/**
 * 按运行时本地时区输出日期。
 *
 * 只在浏览器里调用；服务端渲染与水合首帧请用 {@link formatUtcDate}。
 */
export function formatLocalDate(value: DateValue, locale: string): string {
  const date = toDateValue(value)
  return date ? date.toLocaleDateString(locale) : ''
}

/**
 * 按运行时本地时区输出日期与时间。
 *
 * 只在浏览器里调用；服务端渲染与水合首帧请用 {@link formatUtcDateTime}。
 */
export function formatLocalDateTime(value: DateValue, locale: string): string {
  const date = toDateValue(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale, DATE_TIME_OPTIONS).format(date)
}
