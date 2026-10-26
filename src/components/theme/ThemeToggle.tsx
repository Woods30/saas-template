import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { type ReactElement, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { websiteConfig } from '@/config/website'
import { getTheme, THEME_COOKIE_NAME, THEMES, type Theme } from '@/lib/theme'
import { m } from '@/locale/paraglide/messages.js'

const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export const THEME_ICON = {
  light: IconSun,
  dark: IconMoon,
  system: IconDeviceDesktop,
} as const satisfies Record<Theme, unknown>

export const THEME_LABEL = {
  light: m.theme_light,
  dark: m.theme_dark,
  system: m.theme_system,
} as const satisfies Record<Theme, () => string>

/** 主题状态与写入逻辑，供菜单项形式与独立按钮形式共用，避免 cookie 写入分叉。 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getTheme())

  function apply(next: string) {
    const value = next as Theme
    setTheme(value)
    document.documentElement.dataset.theme = value
    // biome-ignore lint/suspicious/noDocumentCookie: 同步 cookie 保证下一次 SSR 与主题一致，并兼容不支持 Cookie Store 的浏览器。
    document.cookie = `${THEME_COOKIE_NAME}=${value}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
  }

  return { theme, apply, enabled: websiteConfig.ui.enableThemeSwitch }
}

/** 三个主题选项的 RadioGroup；`theme` / `apply` 由调用方传入，可嵌进已有菜单。 */
export function ThemeMenuItems({ theme, apply }: { theme: Theme; apply: (next: string) => void }) {
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={apply}>
      {THEMES.map((option) => {
        const OptionIcon = THEME_ICON[option]
        // 选中指示由 `DropdownMenuRadioItem` 自带，不要再手加 `IconCheck`。
        return (
          <DropdownMenuRadioItem key={option} value={option}>
            <OptionIcon className="size-4" aria-hidden />
            <span className="flex-1">{THEME_LABEL[option]()}</span>
          </DropdownMenuRadioItem>
        )
      })}
    </DropdownMenuRadioGroup>
  )
}

/**
 * 独立图标式主题切换，用于没有用户菜单的位置。直接改写 `<html data-theme>` 并写
 * cookie，不刷新页面；`getTheme()` 在 SSR 与客户端取到同一值，hydration 稳定。
 */
export function ThemeToggle({
  className,
  trigger,
  showLabel = false,
}: {
  className?: string
  /** 自定义触发元素（默认是 ghost 图标按钮）。 */
  trigger?: ReactElement
  /** 触发按钮里是否带文案（侧栏菜单形式用；图标形式靠 `aria-label`）。 */
  showLabel?: boolean
} = {}) {
  const { theme, apply, enabled } = useTheme()

  if (!enabled) return null

  const Icon = THEME_ICON[theme]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={trigger ?? <Button variant="ghost" size="icon" aria-label={m.theme_label()} />}
        className={className}
      >
        <Icon aria-hidden />
        {showLabel && (
          <span className="group-data-[collapsible=icon]:hidden">{m.theme_label()}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-36">
        <ThemeMenuItems theme={theme} apply={apply} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
