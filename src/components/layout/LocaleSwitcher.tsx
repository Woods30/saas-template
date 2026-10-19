import { IconCheck, IconLanguage } from '@tabler/icons-react'
import { LocaleFlag } from '@/components/icons/LocaleFlags'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LOCALE_COOKIE_NAME, LOCALES, type Locale, localeConfig, swapLocale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

interface LocaleSwitcherProps {
  /** 当前 locale，由服务端与客户端解析结果一致地传入。 */
  value: Locale
  /** 追加到触发按钮上的类名（各调用处的外观差异走这里，不改 ui/ 原件）。 */
  className?: string
}

/**
 * 图标式语言切换。
 *
 * 选择后导航到**真实 URL 前缀**（`/zh/pricing` ↔ `/en/pricing`），并同步写
 * `NEXT_LOCALE` cookie，使无前缀的 `/` 也能记住选择。用整页导航而非客户端路由，
 * 与既有「locale 变更必须走文档导航」的约束一致，保证 SSR 与 hydration 一致。
 */
export function LocaleSwitcher({ value, className }: LocaleSwitcherProps) {
  function select(next: Locale) {
    if (next === value) return
    // biome-ignore lint/suspicious/noDocumentCookie: 导航前同步 cookie，保证 SSR 语言一致并兼容不支持 Cookie Store 的浏览器。
    document.cookie = `${LOCALE_COOKIE_NAME}=${next}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
    const { pathname, search, hash } = window.location
    window.location.assign(`${swapLocale(pathname, next)}${search}${hash}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={m.locale_label()} />}
        className={className}
      >
        <IconLanguage aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-36">
        {LOCALES.map((locale) => (
          <DropdownMenuItem key={locale} onClick={() => select(locale)}>
            <LocaleFlag locale={locale} />
            <span className="flex-1">{localeConfig[locale].name}</span>
            {locale === value && <IconCheck className="size-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
