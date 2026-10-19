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

/** 主题 → 图标。`system` 用显示器图标表示「跟随系统」。 */
export const THEME_ICON = {
  light: IconSun,
  dark: IconMoon,
  system: IconDeviceDesktop,
} as const satisfies Record<Theme, unknown>

/** 主题 → 显示名。 */
export const THEME_LABEL = {
  light: m.theme_light,
  dark: m.theme_dark,
  system: m.theme_system,
} as const satisfies Record<Theme, () => string>

/**
 * 主题状态与写入逻辑。
 *
 * 单独抽出来，是为了让**菜单项形式**的主题选择（放进用户菜单 / 任意 DropdownMenu）
 * 与**独立按钮形式**共用同一套状态与 cookie 写入——两处各写一份的话，cookie 名、
 * 过期时间、`data-theme` 的同步很容易分叉。
 */
export function useTheme() {
  // Hooks 必须先于任何 early return 执行，避免条件渲染破坏调用顺序。
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

/**
 * 以 `DropdownMenuRadioGroup` 形式渲染三个主题选项。
 *
 * 调用方负责把 `theme` 与 `apply` 传进来（通常来自 `useTheme()`），这样它可以嵌在
 * 任何已有菜单里（例如用户菜单），不必再套一层弹层。
 */
export function ThemeMenuItems({ theme, apply }: { theme: Theme; apply: (next: string) => void }) {
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={apply}>
      {THEMES.map((option) => {
        const OptionIcon = THEME_ICON[option]
        // 选中指示由 `DropdownMenuRadioItem` 自带（右侧 `RadioItemIndicator`），
        // 这里不要再手加 `IconCheck`——会出现两个勾。
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
 * 独立的图标式主题切换按钮。
 *
 * 用于营销站导航栏、认证页等**没有用户菜单**的位置；工作台里主题选项收在用户菜单
 * 内（见 `DashboardUserCard`），不重复放一个按钮。
 *
 * 弹层用 shadcn 的 `DropdownMenu`（Base UI `Menu` 的封装），与语言切换器、用户菜单
 * 共用同一套弹层样式；选中态用 `RadioItem` 渲染 `aria-checked`，对辅助技术可见。
 * 直接改写 `<html data-theme>` 并写 `THEME` cookie，**不触发整页刷新**，因此不会闪烁。
 * 初始状态经 `getTheme()` 取得：SSR 读 ALS，客户端读 cookie，两侧一致，故 hydration 稳定。
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

  // 主题切换被禁用时整块按钮不渲染，但 Hooks 已在上方执行完毕。
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
