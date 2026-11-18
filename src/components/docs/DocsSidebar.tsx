import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { DOC_FALLBACK_ICON, DOC_ICON } from '@/components/docs/doc-icons'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { websiteConfig } from '@/config/website'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import { DOCS_INDEX_SLUG, type DocEntry, type DocGroup, groupDocs } from '@/modules/docs/service'

/**
 * 文档侧边栏导航（交互参照 GitBook）：按 frontmatter 的 `group` 聚合，组标题可折叠。
 * 分组默认展开、只记用户主动收起的分组，并自动展开当前文档所在分组。
 * 分组名按稳定 key 映射，zh / en 共用同一份内容。
 */

/** 分组 key → 标题文案。未知 key 直接显示 key 本身，便于发现拼写错误。 */
const GROUP_TITLE: Record<string, () => string> = {
  start: m.docs_group_start,
  config: m.docs_group_config,
  deploy: m.docs_group_deploy,
  auth: m.docs_group_auth,
  payment: m.docs_group_payment,
  email: m.docs_group_email,
  notification: m.docs_group_notification,
  analytics: m.docs_group_analytics,
  develop: m.docs_group_develop,
}

export function DocsSidebar({
  docs,
  activeSlug,
  onNavigate,
  locale,
}: {
  docs: DocEntry[]
  /** 当前打开的文档 slug；所在分组会被强制展开。 */
  activeSlug?: string
  onNavigate?: () => void
  /** 当前语言；侧栏链接要带上语言前缀，canonical 才与站内其它地址一致。 */
  locale: Locale
}) {
  const groups = groupDocs(docs)

  // 只记「用户主动收起了哪些」，新增的分组天然是展开的。
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set())

  const activeGroup = useMemo(
    () => groups.find((group) => group.items.some((doc) => doc.slug === activeSlug))?.title,
    [groups, activeSlug],
  )

  // 确保当前文档所在分组展开，否则从搜索跳转过来时高亮条目藏在折叠区里。
  useEffect(() => {
    if (activeGroup === undefined) return
    setCollapsedGroups((previous) => {
      if (!previous.has(activeGroup)) return previous
      const next = new Set(previous)
      next.delete(activeGroup)
      return next
    })
  }, [activeGroup])

  function toggleGroup(key: string) {
    setCollapsedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <nav className="text-sm" aria-label="文档导航">
      {/* 文档站独立部署时的返回入口：放在所有文档分组之前，位置固定、不参与折叠。 */}
      {websiteConfig.docs.homeUrl && (
        <ul className="mb-3 border-b border-border pb-3">
          <li>
            <a
              href={websiteConfig.docs.homeUrl}
              onClick={onNavigate}
              className="group flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <IconArrowLeft className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{m.docs_back_to_site()}</span>
            </a>
          </li>
        </ul>
      )}
      {groups.map((group) =>
        group.title === '' ? (
          <ul key="__root__" className="mb-4 space-y-0.5">
            {group.items.map((doc) => (
              <DocLink
                key={doc.slug}
                doc={doc}
                locale={locale}
                activeSlug={activeSlug}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        ) : (
          <DocGroupSection
            key={group.title}
            group={group}
            open={!collapsedGroups.has(group.title)}
            onToggle={() => toggleGroup(group.title)}
            locale={locale}
            activeSlug={activeSlug}
            onNavigate={onNavigate}
          />
        ),
      )}
    </nav>
  )
}

function DocGroupSection({
  group,
  open,
  onToggle,
  locale,
  activeSlug,
  onNavigate,
}: {
  group: DocGroup
  open: boolean
  onToggle: () => void
  locale: Locale
  activeSlug?: string
  onNavigate?: () => void
}) {
  const title = GROUP_TITLE[group.title]?.() ?? group.title

  return (
    // 受控的 `Collapsible`：`open` 由父级持有，才能被外部导航强制展开。
    <Collapsible open={open} onOpenChange={onToggle} className="mb-1">
      <h2>
        <CollapsibleTrigger className="group mt-5 flex w-full items-center gap-2 rounded-lg px-2 py-1 text-sm text-foreground transition-colors hover:text-primary">
          <span className="truncate">{title}</span>
          {/* `data-panel-open` 由 Base UI trigger 在展开时挂上，无需另存开合状态。 */}
          <IconChevronRight
            className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90"
            aria-hidden
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>
        {/* 不加左侧竖线与缩进：分组标题已表达从属关系，240px 侧栏经不起层层嵌套。 */}
        <ul className="mt-0.5 space-y-0.5">
          {group.items.map((doc) => (
            <DocLink
              key={doc.slug}
              doc={doc}
              locale={locale}
              activeSlug={activeSlug}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function DocLink({
  doc,
  locale,
  activeSlug,
  onNavigate,
}: {
  doc: DocEntry
  locale: Locale
  activeSlug?: string
  onNavigate?: () => void
}) {
  const Icon = DOC_ICON[doc.slug] ?? DOC_FALLBACK_ICON
  // 文档首页渲染在 `/docs`，没有 slug 一段；其余文档按 `/docs/<slug>`。
  const isIndex = doc.slug === DOCS_INDEX_SLUG
  // 选中态自己算，不交给路由的 activeProps：首页的地址是 `/docs`，与
  // `/docs/$slug` 不是同一条路由，交给路由判断会漏掉首页。
  const isActive = activeSlug === doc.slug

  const content = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{doc.title}</span>
    </>
  )

  const className = [
    'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
    // 与工作台侧栏同一套选中态语义，避免站内出现两套导航观感。
    isActive ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li>
      <Link
        to={isIndex ? '/{-$locale}/docs' : '/{-$locale}/docs/$slug'}
        params={isIndex ? { locale } : { slug: doc.slug, locale }}
        // 窄屏抽屉里点击后必须收起，否则新正文被抽屉盖住。
        onClick={onNavigate}
        className={className}
      >
        {content}
      </Link>
    </li>
  )
}
