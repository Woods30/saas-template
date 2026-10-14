import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
  IconX,
} from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { DocsSearch } from '@/components/docs/DocsSearch'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { websiteConfig } from '@/config/website'
import { DOCS_SIDEBAR_COOKIE_NAME, docsForLocale, getSidebarCollapsed } from '@/lib/docs'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

const SIDEBAR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/**
 * 文档站的独立 shell（参考 GitBook 的三栏布局）：
 *
 * - 顶部细条：返回站点首页 + 文档标题，`sticky` 固定；
 * - 左侧栏：文档导航（可滚动）+ 固定在左下角的工具条（语言 + 主题）；
 * - 右侧：正文。
 *
 * 与 `MarketingLayout` 不同，这里不渲染营销站点的 Navbar / Footer，避免在
 * 文档阅读场景里堆叠无关导航。侧边栏本身用 `sticky` 占满视口高度，因此
 * 工具条始终贴在屏幕左下角，不随正文滚动。
 *
 * **自适应布局**：常驻侧栏宽 240px，窄屏放不下——它会把正文挤成一条。因此
 * - 窄屏（< lg）：侧栏默认隐藏，顶部菜单按钮以**抽屉**形式覆盖打开，正文占满宽度；
 * - 宽屏（≥ lg）：侧栏常驻，但可手动收起，把宽度让给正文（偏好写入 cookie）。
 *
 * 初始收起状态经 `getSidebarCollapsed()` 取得：SSR 读 ALS、客户端读 cookie，两侧
 * 一致，因此不会在 hydration 时闪一下再收起。
 */
export function DocsLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  const docs = docsForLocale(locale)
  const { logoLight } = websiteConfig.metadata.images

  // 宽屏下的手动收起偏好（持久化）。
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed)
  // 窄屏抽屉的开合（临时状态，不持久化）。
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerTrigger = useRef<HTMLButtonElement>(null)

  const closeDrawer = useCallback((restoreFocus = false) => {
    setDrawerOpen(false)
    if (restoreFocus) drawerTrigger.current?.focus()
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous
      // biome-ignore lint/suspicious/noDocumentCookie: 侧栏偏好需在客户端即时持久化；cookie 是 SSR 读取该偏好并避免首屏闪烁的唯一途径。
      document.cookie = `${DOCS_SIDEBAR_COOKIE_NAME}=${next ? '1' : '0'}; Path=/; Max-Age=${SIDEBAR_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
      return next
    })
  }, [])

  // 抽屉打开时 Escape 关闭，并把焦点还给触发按钮——否则键盘用户会落在被隐藏的面板里。
  useEffect(() => {
    if (!drawerOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDrawer(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, closeDrawer])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl">
        {/* 窄屏菜单按钮：常驻侧栏在窄屏被隐藏，这是唯一的入口，因此只在 < lg 出现。 */}
        <button
          ref={drawerTrigger}
          type="button"
          aria-label={drawerOpen ? m.docs_sidebar_close() : m.docs_sidebar_open()}
          aria-expanded={drawerOpen}
          onClick={() => (drawerOpen ? closeDrawer(true) : setDrawerOpen(true))}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:hidden"
        >
          {drawerOpen ? (
            <IconX className="size-5" aria-hidden />
          ) : (
            <IconMenu2 className="size-5" aria-hidden />
          )}
        </button>
        <Link
          to="/{-$locale}"
          params={{ locale }}
          aria-label={websiteConfig.metadata.name}
          className="flex shrink-0 items-center rounded-lg px-2 py-1 transition-opacity hover:opacity-80 dark:bg-white"
        >
          <img src={logoLight} alt="" width={1400} height={380} className="h-auto w-28" />
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{m.docs_sidebar_title()}</span>
        {/* 宽屏收起 / 展开开关：收起后把 240px 让给正文，偏好跨会话保留。 */}
        <button
          type="button"
          aria-label={collapsed ? m.docs_sidebar_expand() : m.docs_sidebar_collapse()}
          aria-expanded={!collapsed}
          onClick={toggleCollapsed}
          className="ml-auto hidden size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:inline-flex"
        >
          {collapsed ? (
            <IconLayoutSidebarLeftExpand className="size-5" aria-hidden />
          ) : (
            <IconLayoutSidebarLeftCollapse className="size-5" aria-hidden />
          )}
        </button>
      </header>
      {/* 不居中、不设 max-w：超宽屏下若居中会留下大片空白。正文自身有 max-w-3xl
          约束行宽，因此这里左对齐即可。 */}
      <div className="relative flex w-full flex-1">
        {/* 窄屏抽屉的遮罩：点击任意处关闭。`lg:hidden` 保证宽屏下永不出现。 */}
        {drawerOpen && (
          // `aria-hidden` 的遮罩：点击关闭只是鼠标捷径，键盘用户走 Escape 或关闭按钮。
          <div
            aria-hidden
            onClick={() => closeDrawer(true)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          />
        )}
        <aside
          className={`sticky top-14 flex h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-background ${
            drawerOpen
              ? // 窄屏抽屉：覆盖在正文之上，`z-40` 高于遮罩。不带 `lg:hidden`——
                // 用户在抽屉开着时拉宽窗口，侧栏应回到常驻形态而不是整个消失。
                'fixed inset-y-0 left-0 top-14 z-40 flex'
              : // 关闭时：窄屏不占位，宽屏常驻（除非用户收起）。
                `${collapsed ? 'lg:hidden' : 'lg:flex'} hidden`
          }`}
        >
          {/* 搜索固定在侧栏顶部，不随文档列表滚动——文档变多时它必须一直够得着。 */}
          <div className="border-b border-border p-3">
            <DocsSearch docs={docs} locale={locale} />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <DocsSidebar docs={docs} />
          </div>
          {/* 工具条固定在左下角（GitBook 风格）：不随正文滚动。 */}
          <div className="flex items-center justify-end gap-1 border-t border-border p-3">
            <LocaleSwitcher value={locale} />
            <ThemeToggle />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-10 sm:px-10">{children}</main>
      </div>
    </div>
  )
}
