import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { websiteConfig } from '@/config/website'
import { docsForLocale } from '@/lib/docs'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 文档站的独立 shell（参考 GitBook 的三栏布局）：
 *
 * - 顶部细条：返回站点首页 + 文档标题；
 * - 左侧栏：文档导航（占满剩余高度）；
 * - 左下角：语言切换器（`mt-auto` 贴底）；
 * - 右侧：正文。
 *
 * 与 `MarketingLayout` 不同，这里不渲染营销站点的 Navbar / Footer，避免在
 * 文档阅读场景里堆叠无关导航；语言切换固定放在左下角。
 */
export function DocsLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  const docs = docsForLocale(locale)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center gap-3 border-b border-border px-6">
        <Link
          to="/{-$locale}"
          className="text-sm font-semibold text-foreground hover:opacity-80"
        >
          {websiteConfig.metadata.name}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{m.docs_sidebar_title()}</span>
      </header>
      <div className="flex flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-border">
          <div className="flex-1 overflow-y-auto p-4">
            <DocsSidebar docs={docs} />
          </div>
          {/* 语言切换固定在左下角（GitBook 风格）。 */}
          <div className="mt-auto flex items-center gap-2 border-t border-border p-4">
            <span className="text-xs text-muted-foreground">{m.docs_language_label()}</span>
            <LocaleSwitcher value={locale} />
          </div>
        </aside>
        <main className="flex-1 px-8 py-10">{children}</main>
      </div>
    </div>
  )
}
