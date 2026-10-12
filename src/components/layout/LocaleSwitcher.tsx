import type { ChangeEvent } from 'react'
import { LOCALES, type Locale, localeConfig } from '@/lib/locale'
import { setLocale } from '@/locale/paraglide/runtime.js'

interface LocaleSwitcherProps {
  /** 当前 locale，由服务端与客户端解析结果一致地传入。 */
  value: Locale
}

/**
 * 语言切换下拉框。
 *
 * 复用 Paraglide 的 `setLocale`：它会按编译期策略写入 `NEXT_LOCALE` cookie（见
 * `project.inlang/paraglide.config.ts` 的 `cookieName`）并触发整页重载，使服务端按
 * 新 cookie 重新渲染——locale 变更必须走文档导航，SSR 与 hydration 才会保持一致。
 */
export function LocaleSwitcher({ value }: LocaleSwitcherProps) {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as Locale
    if (next === value) return
    void setLocale(next)
  }

  return (
    <select
      aria-label="切换语言"
      value={value}
      onChange={handleChange}
      className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
    >
      {LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {localeConfig[locale].name}
        </option>
      ))}
    </select>
  )
}
