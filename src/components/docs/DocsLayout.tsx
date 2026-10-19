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
 * 文档站的独立 shell（参考 docs.tanstarter.dev 的三栏布局）：
 *
 * - 宽屏**没有顶栏**：Logo 与侧栏开关并排放在侧栏顶部，下面是搜索、导航与底部工具条；
 * - 窄屏：常驻侧栏放不下，改用一条顶栏（Logo + 搜索图标 + 侧栏开关），侧栏以抽屉覆盖正文；
 * - 右侧：正文。
 *
 * 与 `MarketingLayout` 不同，这里不渲染营销站点的 Navbar / Footer，避免在文档阅读场景里
 * 堆叠无关导航。侧边栏用 `sticky` 占满视口高度，因此底部工具条始终贴在屏幕左下角，
 * 不随正文滚动。
 *
 * **自适应布局**：常驻侧栏宽 240px，窄屏放不下——它会把正文挤成一条。因此
 * - 窄屏（< lg）：侧栏默认隐藏，顶栏的开关以**抽屉**形式覆盖打开，正文占满宽度；
 * - 宽屏（≥ lg）：侧栏常驻，但可手动收起，把宽度让给正文（偏好写入 cookie）。
 *
 * 初始收起状态经 `getSidebarCollapsed()` 取得：SSR 读 ALS、客户端读 cookie，两侧一致，
 * 因此不会在 hydration 时闪一下再收起。
 */
export function DocsLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  const docs = docsForLocale(locale)
  const activeSlug = useActiveDocSlug()
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed)
  // 窄屏抽屉的开合（临时状态，不持久化）。
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 搜索弹窗由本层持有：窄屏顶栏的图标与侧栏的触发器要打开同一个弹窗。
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
      {/* 窄屏顶栏。宽屏下常驻侧栏自己带 Logo 与开关，顶栏只会多占一条，故 `lg:hidden`。 */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b border-border bg-background/90 px-3 backdrop-blur-xl lg:hidden">
        <Link
          to="/{-$locale}"
          params={{ locale }}
          aria-label={websiteConfig.metadata.name}
          className="flex min-w-0 shrink items-center rounded-lg bg-logo-plate px-1 py-1 transition-opacity hover:opacity-80"
        >
          <BrandLogo className="w-28" />
        </Link>
        {/* 侧栏在窄屏被隐藏，搜索与导航都需要这里的入口。 */}
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
      {/* 不居中、不设 max-w：超宽屏下若居中会留下大片空白。正文自身有 max-w-3xl
          约束行宽，因此这里左对齐即可。 */}
      <div className="relative flex w-full flex-1">
        {/* 宽屏常驻侧栏。收起后整块隐藏（把 240px 让给正文），展开入口移到下方浮动工具条。
            窄屏完全不渲染它——窄屏用下面的 `Sheet` 抽屉，两者共用同一份 `SidebarPanel`。 */}
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

        {/* 窄屏抽屉。
            用 shadcn 的 `Sheet`（Base UI Dialog）而不是手写 `fixed` 面板：焦点陷阱、
            `aria-modal`、背景滚动锁、Escape 关闭、关闭后焦点归还，全部由弹层提供。
            手写版缺这些，实测 Tab 会把焦点放到被遮住的正文里。 */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-60 gap-0 p-0" showCloseButton={false}>
            {/* 弹层需要可访问名；视觉上由侧栏头的 logo 承担，故标题只给读屏。 */}
            <SheetTitle className="sr-only">{m.docs_sidebar_title()}</SheetTitle>
            <SheetDescription className="sr-only">{m.docs_sidebar_title()}</SheetDescription>
            <SidebarPanel
              locale={locale}
              docs={docs}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
              activeSlug={activeSlug}
              onClose={() => setDrawerOpen(false)}
              // 点文档后收起抽屉，否则新正文被盖住，用户不知道跳转成功了。
              onNavigate={() => setDrawerOpen(false)}
            />
          </SheetContent>
        </Sheet>
        {/* 收起后侧栏整块隐藏，展开入口必须留在侧栏之外——否则用户再也点不到它。
            固定在**左上角**（参照 docs.tanstarter.dev）：侧栏收起后正文从左侧顶格开始，
            左上角是原本侧栏开关所在的位置，视线不用移动；放左下角则要越过整页正文才找得到。
            宽屏专属：窄屏走顶栏的抽屉按钮。 */}
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
        {/* 收起态在左侧让出一条与浮动工具条等宽的空白（`lg:pl-20`）：不让我，左上角的
            按钮会压住正文标题。展开态恢复常规内边距。 */}
        <main className={`min-w-0 flex-1 px-6 py-10 sm:px-10 ${collapsed ? 'lg:pl-20' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * 当前打开的文档 slug，供侧栏展开所在分组。
 *
 * `/docs` 本身渲染的是 `index` 文档（见 `docsLanding`），因此路径为空时也返回
 * `index`——否则停在文档首页时，index 所在分组不会被展开。
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

/**
 * 侧栏面板本体：宽屏常驻侧栏与窄屏抽屉共用同一份内容。
 *
 * 两处只有「关闭方式」不同——宽屏给收起按钮，抽屉给关闭按钮——其余结构、尺寸、
 * 底部工具条必须一致，否则同一个导航会在两种断点下长得不一样。
 */
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
      {/* Logo 与「文档」后缀并排：参照站把品牌名与栏目名并读，明确这是文档站而非营销
          首页。抽屉里宽度只有 240px，后缀隐藏，位置让给关闭按钮。 */}
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
        {/* 宽屏收起开关：收起后把 240px 让给正文，偏好跨会话保留。收起后本侧栏整块
            隐藏，这个按钮也就点不到了，展开入口改由下方浮动工具条提供——因此收起态
            不再渲染它，避免 DOM 里出现两个同名「展开文档导航」按钮。 */}
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
        {/* 抽屉的关闭按钮。顶栏的开关在抽屉打开时被遮罩盖住，够不到，因此必须有一个
            在面板内的出口。 */}
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
      {/* 搜索固定在侧栏顶部，不随文档列表滚动——文档变多时它必须一直够得着。 */}
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
      {/* 工具条固定在左下角（GitBook 风格）：不随正文滚动。 */}
      <div className="flex items-center justify-end gap-1 border-t border-border p-3">
        <LocaleSwitcher value={locale} className={ICON_BUTTON_BORDER} />
        <ThemeToggle className={ICON_BUTTON_BORDER} />
      </div>
    </div>
  )
}
