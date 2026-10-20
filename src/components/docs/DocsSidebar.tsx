import { IconChevronRight } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { DOC_FALLBACK_ICON, DOC_ICON } from '@/components/docs/doc-icons'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { type DocEntry, type DocGroup, groupDocs } from '@/lib/docs'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 文档侧边栏导航（交互参照 GitBook）。
 *
 * 支持二级结构：文档按 frontmatter 的 `group` 聚合成组，组标题可点击折叠；无
 * `group` 的文档直接列在顶层（见 `groupDocs`），不渲染可折叠标题。条目由父级
 * `DocsLayout` 按当前语言解析后传入，本组件不自行读取 locale。
 *
 * **分组默认全部展开，但记住用户的手动折叠**：文档站的分组是主题分区而非层级
 * 菜单，一进来全收起来会让人以为只有几个入口。另外，从搜索跳到某个分组的文档时，
 * 该分组会被自动展开——否则跳过去后当前条目藏在折叠区里，用户看不到自己在哪。
 *
 * 分组名与图标都按**稳定 key** 映射：`group` 存 `config` / `features` 而非中文，
 * 因此同一份内容在 zh / en 下都能取到对应文案与同一枚图标。
 */

/** 分组 key → 标题文案。未知 key 直接显示 key 本身，便于内容作者发现拼写错误。 */
const GROUP_TITLE: Record<string, () => string> = {
  start: m.docs_group_start,
  config: m.docs_group_config,
  deploy: m.docs_group_deploy,
  features: m.docs_group_features,
  develop: m.docs_group_develop,
}

export function DocsSidebar({
  docs,
  activeSlug,
  onNavigate,
}: {
  docs: DocEntry[]
  /** 当前打开的文档 slug；所在分组会被强制展开。 */
  activeSlug?: string
  onNavigate?: () => void
}) {
  const groups = groupDocs(docs)

  // 折叠状态按分组 key 记录。默认全开，只记「用户主动收起了哪些」，
  // 这样内容新增的分组天然是展开的，不需要维护一份初始状态。
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set())

  const activeGroup = useMemo(
    () => groups.find((group) => group.items.some((doc) => doc.slug === activeSlug))?.title,
    [groups, activeSlug],
  )

  // 当前文档落在某个分组里时，确保该分组是展开的：从搜索跳转过来时尤其需要，
  // 否则高亮的条目被折叠区藏住。
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
      {groups.map((group) =>
        group.title === '' ? (
          // 匿名组（无 group 的文档）没有可折叠的标题，直接列出条目。
          <ul key="__root__" className="mb-4 space-y-0.5">
            {group.items.map((doc) => (
              <DocLink key={doc.slug} doc={doc} onNavigate={onNavigate} />
            ))}
          </ul>
        ) : (
          <DocGroupSection
            key={group.title}
            group={group}
            open={!collapsedGroups.has(group.title)}
            onToggle={() => toggleGroup(group.title)}
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
  onNavigate,
}: {
  group: DocGroup
  open: boolean
  onToggle: () => void
  onNavigate?: () => void
}) {
  const title = GROUP_TITLE[group.title]?.() ?? group.title

  return (
    // 受控的 `Collapsible`：`open` 由父级持有，才能在被外部导航「强制展开」。
    <Collapsible open={open} onOpenChange={onToggle} className="mb-1">
      <h2>
        {/* 分组标题（参照 docs.tanstarter.dev）：正文色、常规字重、不加大写与字距，
            只靠上间距与「比条目浅一档的层级」区分。原来的小号大写加粗标题在 240px
            侧栏里几乎和条目抢注意力，读起来像另一个导航层。 */}
        <CollapsibleTrigger className="group mt-5 flex w-full items-center gap-2 rounded-lg px-2 py-1 text-sm text-foreground transition-colors hover:text-primary">
          <span className="truncate">{title}</span>
          {/* 折叠指示：`data-panel-open` 由 Base UI 的 trigger 在展开时挂上，
              箭头随之转 90°，不需要另存一份开合状态。 */}
          <IconChevronRight
            className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90"
            aria-hidden
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>
        {/* 条目直接平铺，不再加左侧竖线与额外缩进：分组标题已经表达了从属关系，
            再画一条竖线会让 240px 宽的侧栏显得层层嵌套、可用宽度变窄。 */}
        <ul className="mt-0.5 space-y-0.5">
          {group.items.map((doc) => (
            <DocLink key={doc.slug} doc={doc} onNavigate={onNavigate} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function DocLink({ doc, onNavigate }: { doc: DocEntry; onNavigate?: () => void }) {
  const Icon = DOC_ICON[doc.slug] ?? DOC_FALLBACK_ICON

  return (
    <li>
      <Link
        to="/{-$locale}/docs/$slug"
        params={{ slug: doc.slug }}
        // 当前项与工作台侧栏（shadcn `SidebarMenuButton` 的 `data-active`）用同一套
        // 语义：`sidebar-accent` 面 + `sidebar-accent-foreground` 文字 + 中等字重。
        // 两处侧栏在同一个站点里，选中态长得不一样会让人以为是两套导航。
        activeProps={{
          className: 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        }}
        // 窄屏抽屉里点击条目后必须收起抽屉：不关的话新正文被抽屉盖住，
        // 用户还得再点一次关闭按钮才知道跳转成功了。
        onClick={onNavigate}
        className="group flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{doc.title}</span>
      </Link>
    </li>
  )
}
