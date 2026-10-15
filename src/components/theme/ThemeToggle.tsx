import { Menu } from '@base-ui/react/menu'
import { IconCheck, IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { websiteConfig } from '@/config/website'
import { getTheme, THEME_COOKIE_NAME, THEMES, type Theme } from '@/lib/theme'
import { m } from '@/locale/paraglide/messages.js'

const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/** 主题 → 图标。`system` 用显示器图标表示「跟随系统」。 */
const THEME_ICON = {
  light: IconSun,
  dark: IconMoon,
  system: IconDeviceDesktop,
} as const satisfies Record<Theme, unknown>

/** 主题 → 显示名。 */
const THEME_LABEL = {
  light: m.theme_light,
  dark: m.theme_dark,
  system: m.theme_system,
} as const satisfies Record<Theme, () => string>

/**
 * 图标式主题切换：点击展开菜单，**直接点选** light / dark / system。
 *
 * 与语言切换器同构（Base UI `Menu` + 选中打勾），比逐级循环更直观——用户想跳到哪个
 * 主题就点哪个，不必先算好要点几次。直接改写 `<html data-theme>` 并写 `THEME` cookie，
 * **不触发整页刷新**，因此不会闪烁。初始状态经 `getTheme()` 取得：SSR 读 ALS，客户端读
 * cookie，两侧一致，故 hydration 稳定。
 */
export function ThemeToggle() {
  // Hooks 必须先于任何 early return 执行，避免条件渲染破坏调用顺序。
  const [theme, setTheme] = useState<Theme>(() => getTheme())
  const Icon = THEME_ICON[theme]

  function apply(next: Theme) {
    setTheme(next)
    document.documentElement.dataset.theme = next
    // biome-ignore lint/suspicious/noDocumentCookie: 同步 cookie 保证下一次 SSR 与主题一致，并兼容不支持 Cookie Store 的浏览器。
    document.cookie = `${THEME_COOKIE_NAME}=${next}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
  }

  // 主题切换被禁用时整块按钮不渲染，但 Hooks 已在上方执行完毕。
  if (!websiteConfig.ui.enableThemeSwitch) return null

  return (
    <Menu.Root>
      <Menu.Trigger render={<Button variant="ghost" size="icon" aria-label={m.theme_label()} />}>
        <Icon aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            {/* 用 RadioItem 而非 Item：主题是三选一，RadioItem 会渲染 aria-checked，
                让选中态对辅助技术可见，而不是只靠一个视觉上的对勾。 */}
            <Menu.RadioGroup value={theme}>
              {THEMES.map((option) => {
                const OptionIcon = THEME_ICON[option]
                return (
                  <Menu.RadioItem
                    key={option}
                    value={option}
                    onClick={() => apply(option)}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                  >
                    <OptionIcon className="size-4" aria-hidden />
                    <span className="flex-1">{THEME_LABEL[option]()}</span>
                    {option === theme && <IconCheck className="size-4" aria-hidden />}
                  </Menu.RadioItem>
                )
              })}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
