import { Menu } from '@base-ui/react/menu'
import { IconCheck, IconLanguage } from '@tabler/icons-react'
import { LocaleFlag } from '@/components/icons/LocaleFlags'
import { Button } from '@/components/ui/button'
import { LOCALE_COOKIE_NAME, LOCALES, type Locale, localeConfig, swapLocale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

interface LocaleSwitcherProps {
  /** 当前 locale，由服务端与客户端解析结果一致地传入。 */
  value: Locale
}

/**
 * 图标式语言切换。
 *
 * 选择后导航到**真实 URL 前缀**（`/zh/pricing` ↔ `/en/pricing`），并同步写
 * `NEXT_LOCALE` cookie，使无前缀的 `/` 也能记住选择。用整页导航而非客户端路由，
 * 与既有「locale 变更必须走文档导航」的约束一致，保证 SSR 与 hydration 一致。
 */
export function LocaleSwitcher({ value }: LocaleSwitcherProps) {
  function select(next: Locale) {
    if (next === value) return
    // biome-ignore lint/suspicious/noDocumentCookie: 导航前同步 cookie，保证 SSR 语言一致并兼容不支持 Cookie Store 的浏览器。
    document.cookie = `${LOCALE_COOKIE_NAME}=${next}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
    const { pathname, search, hash } = window.location
    window.location.assign(`${swapLocale(pathname, next)}${search}${hash}`)
  }

  return (
    <Menu.Root>
      <Menu.Trigger render={<Button variant="ghost" size="icon" aria-label={m.locale_label()} />}>
        <IconLanguage aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            {LOCALES.map((locale) => (
              <Menu.Item
                key={locale}
                onClick={() => select(locale)}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              >
                <LocaleFlag locale={locale} />
                <span className="flex-1">{localeConfig[locale].name}</span>
                {locale === value && <IconCheck className="size-4" aria-hidden />}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
