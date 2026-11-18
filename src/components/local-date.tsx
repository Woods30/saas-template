import { useSyncExternalStore } from 'react'
import {
  type DateValue,
  formatLocalDate,
  formatLocalDateTime,
  formatUtcDate,
  formatUtcDateTime,
} from '@/lib/datetime'

/** 本地时区在运行期不会变，没有需要通知的外部来源。 */
const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

/**
 * 当前是否已在浏览器渲染。
 *
 * SSR 与水合首帧取服务端快照（`false`），挂载后 React 用客户端快照（`true`）重渲染。
 * 服务端 HTML 与客户端首帧因此完全一致，跨时区也不会触发水合失败。
 */
function useIsBrowser(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}

export interface LocalDateProps {
  /** 日期值：`Date`、Unix 毫秒数或可解析的字符串。 */
  value: DateValue
  /**
   * 当前语言。
   *
   * 必须显式传入：不传会落到运行时默认语言（Node 与浏览器往往不同），那是与时区
   * 无关的第二个水合失败来源。
   */
  locale: string
  /** 值为空或非法时的占位文案。 */
  fallback?: string
}

/**
 * 以浏览器本地时区展示「时刻」（如订单创建时间）。
 *
 * 服务端渲染与水合首帧用 UTC，挂载后切到浏览器本地时区。
 *
 * 用于**时刻**。记的是某一天的值（文章发布日、更新日志日期）请直接调
 * `formatUtcDate`：锁定 UTC 才能让所有人看到作者写下的那一天。
 */
export function LocalDate({ value, locale, fallback = '—' }: LocalDateProps) {
  const isBrowser = useIsBrowser()
  const text = isBrowser ? formatLocalDate(value, locale) : formatUtcDate(value, locale)
  return <>{text || fallback}</>
}

/**
 * 以浏览器本地时区展示「日期 + 时间」（如会话创建时间）。
 *
 * 与 {@link LocalDate} 同样的时区策略。
 */
export function LocalDateTime({ value, locale, fallback = '—' }: LocalDateProps) {
  const isBrowser = useIsBrowser()
  const text = isBrowser ? formatLocalDateTime(value, locale) : formatUtcDateTime(value, locale)
  return <>{text || fallback}</>
}
