import {
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSearch,
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
  const { logoLight } = websiteConfig.metadata.images

  // 宽屏下的手动收起偏好（持久化）。
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed)
  // 窄屏抽屉的开合（临时状态，不持久化）。
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 搜索弹窗由本层持有：窄屏顶栏的图标与侧栏的触发器要打开同一个弹窗。
  const [searchOpen, setSearchOpen] = useState(false)
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
      {/* 窄屏顶栏。宽屏下常驻侧栏自己带 Logo 与开关，顶栏只会多占一条，故 `lg:hidden`。 */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b border-border bg-background/90 px-3 backdrop-blur-xl lg:hidden">
        <Link
          to="/{-$locale}"
          params={{ locale }}
          aria-label={websiteConfig.metadata.name}
          className="flex min-w-0 shrink items-center rounded-lg px-1 py-1 transition-opacity hover:opacity-80 dark:bg-white"
        >
          <img src={logoLight} alt="" width={1400} height={380} className="h-auto w-28" />
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
          ref={drawerTrigger}
          type="button"
          aria-label={drawerOpen ? m.docs_sidebar_close() : m.docs_sidebar_open()}
          aria-expanded={drawerOpen}
          onClick={() => (drawerOpen ? closeDrawer(true) : setDrawerOpen(true))}
          className={`${ICON_BUTTON_CLASS} size-9`}
        >
          {drawerOpen ? (
            <IconX className="size-5" aria-hidden />
          ) : (
            <IconLayoutSidebar className="size-5" aria-hidden />
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
          className={`flex w-60 shrink-0 flex-col border-r border-border bg-background ${
            drawerOpen
              ? // 窄屏抽屉：覆盖在正文之上，`z-40` 高于遮罩；顶部让出顶栏高度。不带
                // `lg:hidden`——用户在抽屉开着时拉宽窗口，侧栏应回到常驻形态而不是整个消失。
                'fixed inset-y-0 left-0 top-14 z-40 flex lg:sticky lg:top-0 lg:h-dvh'
              : // 关闭时：窄屏不占位，宽屏常驻（除非用户收起）。
                `sticky top-0 h-dvh ${collapsed ? 'lg:hidden' : 'lg:flex'} hidden`
          }`}
        >
          {/* 宽屏没有顶栏，Logo 与收起开关并排放在这里。窄屏抽屉不在此放关闭按钮：
              顶栏的同一个开关已切换成「关闭」语义，重复渲染会让同名按钮出现两次。 */}
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Link
              to="/{-$locale}"
              params={{ locale }}
              aria-label={websiteConfig.metadata.name}
              className="flex min-w-0 items-center rounded-lg py-1 transition-opacity hover:opacity-80 dark:bg-white"
            >
              <img src={logoLight} alt="" width={1400} height={380} className="h-auto w-24" />
            </Link>
            {/* 与 Logo 并排的「文档」后缀：参照站把品牌名与栏目名并读，明确这是文档站
                而非营销首页。窄屏抽屉里隐藏——顶栏已经表达过一次。 */}
            <span className="hidden text-sm text-muted-foreground lg:inline">
              {m.docs_sidebar_title()}
            </span>
            {/* 宽屏收起开关：收起后把 240px 让给正文，偏好跨会话保留。收起后本侧栏整块
                隐藏，这个按钮也就点不到了，展开入口改由下方浮动工具条提供——因此收起态
                不再渲染它，避免 DOM 里出现两个同名「展开文档导航」按钮。 */}
            {!collapsed && (
              <button
                type="button"
                aria-label={m.docs_sidebar_collapse()}
                aria-expanded
                onClick={toggleCollapsed}
                className={`${ICON_BUTTON_CLASS} ml-auto hidden size-8 lg:inline-flex`}
              >
                <IconLayoutSidebarLeftCollapse className="size-4" aria-hidden />
              </button>
            )}
          </div>
          {/* 搜索固定在侧栏顶部，不随文档列表滚动——文档变多时它必须一直够得着。 */}
          <div className="border-b border-border p-3">
            <DocsSearch
              docs={docs}
              locale={locale}
              open={searchOpen}
              onOpenChange={setSearchOpen}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <DocsSidebar docs={docs} />
          </div>
          {/* 工具条固定在左下角（GitBook 风格）：不随正文滚动。 */}
          <div className="flex items-center justify-end gap-1 border-t border-border p-3">
            <LocaleSwitcher value={locale} className={ICON_BUTTON_BORDER} />
            <ThemeToggle className={ICON_BUTTON_BORDER} />
          </div>
        </aside>
        {/* 收起后侧栏整块隐藏，展开入口必须留在侧栏之外——否则用户再也点不到它。
            宽屏专属：窄屏走顶栏的抽屉按钮。 */}
        {collapsed && (
          <div className="fixed bottom-4 left-4 z-40 hidden items-center gap-0.5 rounded-xl border border-border bg-muted p-0.5 text-muted-foreground shadow-lg lg:flex">
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
        <main className="min-w-0 flex-1 px-6 py-10 sm:px-10">{children}</main>
      </div>
    </div>
  )
}
