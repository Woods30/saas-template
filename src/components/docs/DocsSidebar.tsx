import { IconBook, IconPlugConnected, IconRocket, IconSettings } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { DOC_FALLBACK_ICON, DOC_ICON } from '@/components/docs/doc-icons'
import { type DocEntry, type DocGroup, groupDocs } from '@/lib/docs'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 文档侧边栏导航。
 *
 * 支持二级结构：文档按 frontmatter 的 `group` 聚合成组，组标题不可点击，只作
 * 主题分区；无 `group` 的文档直接列在顶层（见 `groupDocs`）。条目由父级
 * `DocsLayout` 按当前语言解析后传入，本组件保持纯展示，不自行读取 locale。
 *
 * 分组名与图标都按**稳定 key** 映射：`group` 存 `config` / `features` 而非中文，
 * 因此同一份内容在 zh / en 下都能取到对应文案与同一枚图标。
 */

/** 分组 key → 标题文案。未知 key 直接显示 key 本身，便于内容作者发现拼写错误。 */
const GROUP_TITLE: Record<string, () => string> = {
  start: m.docs_group_start,
  config: m.docs_group_config,
  features: m.docs_group_features,
}

/** 分组 key → 图标。 */
const GROUP_ICON: Record<string, typeof IconBook> = {
  start: IconRocket,
  config: IconSettings,
  features: IconPlugConnected,
}

export function DocsSidebar({ docs }: { docs: DocEntry[] }) {
  const groups = groupDocs(docs)

  return (
    <nav className="text-sm" aria-label="文档导航">
      {groups.map((group) => (
        <DocGroupSection key={group.title || '__root__'} group={group} />
      ))}
    </nav>
  )
}

function DocGroupSection({ group }: { group: DocGroup }) {
  // 匿名组（无 group 的文档）不渲染标题，直接列出条目。
  if (group.title === '') {
    return (
      <ul className="mb-4 space-y-0.5">
        {group.items.map((doc) => (
          <DocLink key={doc.slug} doc={doc} />
        ))}
      </ul>
    )
  }

  const GroupIcon = GROUP_ICON[group.title] ?? IconBook
  const title = GROUP_TITLE[group.title]?.() ?? group.title

  return (
    <section className="mb-5">
      <h2 className="mb-1.5 flex items-center gap-1.5 px-2 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
        <GroupIcon className="size-3.5" aria-hidden />
        {title}
      </h2>
      {/* 二级条目相对组标题缩进，并用一条竖线标出从属关系。 */}
      <ul className="ml-3 space-y-0.5 border-l border-border/70 pl-2">
        {group.items.map((doc) => (
          <DocLink key={doc.slug} doc={doc} />
        ))}
      </ul>
    </section>
  )
}

function DocLink({ doc }: { doc: DocEntry }) {
  const Icon = DOC_ICON[doc.slug] ?? DOC_FALLBACK_ICON

  return (
    <li>
      <Link
        to="/{-$locale}/docs/$slug"
        params={{ slug: doc.slug }}
        activeProps={{ className: 'bg-muted font-semibold text-foreground' }}
        className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <Icon
          className="size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground"
          aria-hidden
        />
        <span className="truncate">{doc.title}</span>
      </Link>
    </li>
  )
}
