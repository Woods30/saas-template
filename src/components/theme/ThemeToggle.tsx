import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getTheme, nextTheme, THEME_COOKIE_NAME, type Theme } from '@/lib/theme'
import { m } from '@/locale/paraglide/messages.js'

const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/** 主题 → 图标。`system` 用显示器图标表示「跟随系统」。 */
const THEME_ICON = {
  light: IconSun,
  dark: IconMoon,
  system: IconDeviceDesktop,
} as const satisfies Record<Theme, unknown>

/** 当前主题 → 点击后切换到的下一个主题的标签（用于 aria-label / title）。 */
const NEXT_THEME_LABEL = {
  light: m.theme_dark,
  dark: m.theme_system,
  system: m.theme_light,
} as const satisfies Record<Theme, () => string>

/**
 * 图标式主题切换按钮，循环 light → dark → system。
 *
 * 直接改写 `<html data-theme>` 并写 `THEME` cookie，**不触发整页刷新**，因此不会闪烁。
 * 初始状态经 `getTheme()` 取得：SSR 读 ALS，客户端读 cookie，两侧一致，故 hydration 稳定。
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getTheme())
  const Icon = THEME_ICON[theme]

  function apply(next: Theme) {
    setTheme(next)
    document.documentElement.dataset.theme = next
    document.cookie = `${THEME_COOKIE_NAME}=${next}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
  }

  const label = `${m.theme_label()}: ${NEXT_THEME_LABEL[theme]()}`

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => apply(nextTheme(theme))}
    >
      <Icon aria-hidden />
    </Button>
  )
}
