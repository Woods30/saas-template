import {
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { type ReactNode, useCallback, useState } from 'react'
import { DocsSearch } from '@/components/docs/DocsSearch'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { websiteConfig } from '@/config/website'
import {
  DOCS_INDEX_SLUG,
  DOCS_SIDEBAR_COOKIE_NAME,
  docsForLocale,
  getSidebarCollapsed,
} from '@/lib/docs'
import { type Locale, stripLocalePrefix } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

const SIDEBAR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/** 工具条图标按钮的圆边框：与文档站顶栏/侧栏的 pill 形按钮统一。 */
const ICON_BUTTON_BORDER = 'rounded-full border border-border'

/** 顶栏与侧栏里图标按钮共用的外观（尺寸随调用处覆盖）。 */
const ICON_BUTTON_CLASS =
  'inline-flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'

/**
 * 文档站 shell（参考 docs.tanstarter.dev）：宽屏无顶栏，Logo 与侧栏开关在侧栏顶部；
 * 窄屏（< lg）侧栏改为顶栏触发的抽屉。初始收起状态由 `getSidebarCollapsed()` 同时
 * 从 SSR 的 ALS 与客户端 cookie 取得，两侧一致，因此 hydration 不会闪。
 */
export function DocsLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  const docs = docsForLocale(locale)
  const activeSlug = useActiveDocSlug()
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed)
  // 窄屏抽屉的开合，临时状态不持久化。
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 搜索弹窗由本层持有，顶栏图标与侧栏触发器要打开同一个弹窗。
  const [searchOpen, setSearchOpen] = useState(false)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous
      // biome-ignore lint/suspicious/noDocumentCookie: 侧栏偏好需在客户端即时持久化；cookie 是 SSR 读取该偏好并避免首屏闪烁的唯一途径。
      document.cookie = `${DOCS_SIDEBAR_COOKIE_NAME}=${next ? '1' : '0'}; Path=/; Max-Age=${SIDEBAR_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
      return next
    })
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      {/* 宽屏下侧栏自带 Logo 与开关，顶栏只会多占一条，故 `lg:hidden`。 */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b border-border bg-background/90 px-3 backdrop-blur-xl lg:hidden">
        <Link
          to="/{-$locale}"
          params={{ locale }}
          aria-label={websiteConfig.metadata.name}
          className="flex min-w-0 shrink items-center rounded-lg bg-logo-plate px-1 py-1 transition-opacity hover:opacity-80"
        >
          <BrandLogo className="w-28" />
        </Link>
        <button
          type="button"
          aria-label={m.docs_search_label()}
          onClick={() => setSearchOpen(true)}
          className={`${ICON_BUTTON_CLASS} ml-auto size-9`}
        >
          <IconSearch className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={m.docs_sidebar_open()}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className={`${ICON_BUTTON_CLASS} size-9`}
        >
          <IconLayoutSidebar className="size-5" aria-hidden />
        </button>
      </header>
      {/* 不居中、不设 max-w：正文自身有 max-w-3xl 约束行宽。 */}
      <div className="relative flex w-full flex-1">
        {/* 宽屏常驻侧栏；窄屏完全不渲染，改用下面的 `Sheet` 抽屉，共用 `SidebarPanel`。 */}
        <aside
          className={`sticky top-0 h-dvh w-60 shrink-0 ${collapsed ? 'hidden' : 'hidden lg:flex'}`}
        >
          <SidebarPanel
            locale={locale}
            docs={docs}
            searchOpen={searchOpen}
            onSearchOpenChange={setSearchOpen}
            activeSlug={activeSlug}
            showCollapseButton
            onCollapse={toggleCollapsed}
          />
        </aside>

        {/* 用 `Sheet` 而非手写 `fixed` 面板：焦点陷阱、`aria-modal`、滚动锁与焦点归还
            都由弹层提供；手写版实测 Tab 会把焦点放进被遮住的正文。 */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-60 gap-0 p-0" showCloseButton={false}>
            {/* 弹层需要可访问名，视觉上由侧栏头 logo 承担，故只给读屏。 */}
            <SheetTitle className="sr-only">{m.docs_sidebar_title()}</SheetTitle>
            <SheetDescription className="sr-only">{m.docs_sidebar_title()}</SheetDescription>
            <SidebarPanel
              locale={locale}
              docs={docs}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
              activeSlug={activeSlug}
              onClose={() => setDrawerOpen(false)}
              onNavigate={() => setDrawerOpen(false)}
            />
          </SheetContent>
        </Sheet>
        {/* 收起后侧栏整块隐藏，展开入口必须留在侧栏之外。固定在左上角：那里原本
            就是侧栏开关的位置，视线不用移动。宽屏专属，窄屏走顶栏的抽屉按钮。 */}
        {collapsed && (
          <div className="fixed top-4 left-4 z-40 hidden items-center gap-0.5 rounded-xl border border-border bg-muted p-0.5 text-muted-foreground shadow-lg lg:flex">
            <button
              type="button"
              aria-label={m.docs_sidebar_expand()}
              aria-expanded={false}
              onClick={toggleCollapsed}
              className={`${ICON_BUTTON_CLASS} size-8`}
            >
              <IconLayoutSidebarLeftExpand className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={m.docs_search_label()}
              onClick={() => setSearchOpen(true)}
              className={`${ICON_BUTTON_CLASS} size-8`}
            >
              <IconSearch className="size-4" aria-hidden />
            </button>
          </div>
        )}
        {/* 收起态在左侧让出空白，否则左上角浮动按钮会压住正文标题。 */}
        <main className={`min-w-0 flex-1 px-6 py-10 sm:px-10 ${collapsed ? 'lg:pl-20' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * 当前文档 slug，供侧栏展开所在分组。`/docs` 本身渲染 `index` 文档，
 * 因此路径为空时也返回 `index`。
 */
function useActiveDocSlug(): string {
  return useRouterState({
    select: (state) => {
      const path = stripLocalePrefix(state.location.pathname)
      if (!path.startsWith('/docs')) return DOCS_INDEX_SLUG
      return path.slice('/docs'.length).replace(/^\//, '') || DOCS_INDEX_SLUG
    },
  })
}

/** 侧栏面板：宽屏常驻侧栏与窄屏抽屉共用，两者只有「关闭方式」不同。 */
function SidebarPanel({
  locale,
  docs,
  searchOpen,
  onSearchOpenChange,
  activeSlug,
  showCollapseButton = false,
  onCollapse,
  onClose,
  onNavigate,
}: {
  locale: Locale
  docs: ReturnType<typeof docsForLocale>
  searchOpen: boolean
  onSearchOpenChange: (open: boolean) => void
  activeSlug?: string
  showCollapseButton?: boolean
  onCollapse?: () => void
  onClose?: () => void
  onNavigate?: () => void
}) {
  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-sidebar">
      {/* 抽屉里宽度只有 240px，后缀隐藏，位置让给关闭按钮。 */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Link
          to="/{-$locale}"
          params={{ locale }}
          aria-label={websiteConfig.metadata.name}
          className="flex min-w-0 items-center rounded-lg bg-logo-plate py-1 transition-opacity hover:opacity-80"
        >
          <BrandLogo className="w-24" />
        </Link>
        <span className="hidden text-sm text-muted-foreground lg:inline">
          {m.docs_sidebar_title()}
        </span>
        {/* 收起后本侧栏整块隐藏，展开入口由浮动工具条提供，避免 DOM 里出现两个同名按钮。 */}
        {showCollapseButton && onCollapse && (
          <button
            type="button"
            aria-label={m.docs_sidebar_collapse()}
            aria-expanded
            onClick={onCollapse}
            className={`${ICON_BUTTON_CLASS} ml-auto hidden size-8 lg:inline-flex`}
          >
            <IconLayoutSidebarLeftCollapse className="size-4" aria-hidden />
          </button>
        )}
        {/* 抽屉打开时顶栏开关被遮罩盖住，面板内必须留一个出口。 */}
        {onClose && (
          <button
            type="button"
            aria-label={m.docs_sidebar_close()}
            onClick={onClose}
            className={`${ICON_BUTTON_CLASS} ml-auto size-8`}
          >
            <IconX className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {/* 搜索固定在侧栏顶部，不随文档列表滚动。 */}
      <div className="border-b border-border p-3">
        <DocsSearch
          docs={docs}
          locale={locale}
          open={searchOpen}
          onOpenChange={onSearchOpenChange}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <DocsSidebar docs={docs} activeSlug={activeSlug} onNavigate={onNavigate} />
      </div>
      {/* 工具条固定在侧栏底部（GitBook 风格），不随正文滚动。 */}
      <div className="flex items-center justify-end gap-1 border-t border-border p-3">
        <LocaleSwitcher value={locale} className={ICON_BUTTON_BORDER} />
        <ThemeToggle className={ICON_BUTTON_BORDER} />
      </div>
    </div>
  )
}
