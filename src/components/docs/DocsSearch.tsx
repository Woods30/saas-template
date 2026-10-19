import { IconCornerDownRight, IconSearch } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useCallback, useEffect, useId, useState } from 'react'
import { DOC_FALLBACK_ICON, DOC_ICON } from '@/components/docs/doc-icons'
import { Command, CommandDialog, CommandInput, CommandList } from '@/components/ui/command'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { type DocEntry, type DocSearchResult, searchDocs } from '@/lib/docs'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 文档搜索：侧栏顶部的触发器 + 屏幕居中的搜索弹窗。
 *
 * 侧栏只有 240px 宽，结果直接铺在侧栏里会被挤成一两行、看不出上下文；改成居中
 * 弹窗后结果有足够宽度展示标题、描述与命中摘要。
 *
 * 纯前端检索（见 `searchDocs`）：文档在构建期已全部载入，无需请求后端。默认**不**
 * 列出全部文档——只有输入关键词后才给结果；命中正文时按 h2 → h3 的层级渲染目录树，
 * 让人一眼看出命中在文档的哪个位置。
 *
 * 弹窗开合可由父级接管（`open` / `onOpenChange`）：窄屏顶栏的搜索图标与侧栏的触发器
 * 要打开**同一个**弹窗，而窄屏下侧栏本身是隐藏的，状态只能由共同的父级持有。
 */
export function DocsSearch({
  docs,
  locale,
  open,
  onOpenChange,
}: {
  docs: DocEntry[]
  locale: Locale
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  // 未受控时自持状态；受控时完全由父级决定开合。
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const openState = isControlled ? open : internalOpen
  const [query, setQuery] = useState('')
  const listId = useId()

  const results = searchDocs(docs, query)
  const hasQuery = query.trim() !== ''

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
      // 关闭时清空查询：下次打开是干净的起点，而不是上次的残词。
      if (!next) setQuery('')
    },
    [isControlled, onOpenChange],
  )

  // ⌘K / Ctrl+K 打开搜索：这是搜索框上标注的快捷键，必须真的可用，否则标注即谎言。
  // 依赖 `openState`：关闭后才重新挂监听，弹窗已开时不必再抢快捷键。
  useEffect(() => {
    if (openState) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openState, setOpen])

  return (
    <>
      <button
        type="button"
        aria-label={m.docs_search_label()}
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <IconSearch className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{m.docs_search_placeholder()}</span>
        {/* 键帽提示：让「⌘K 可用」这件事在界面上可见。 */}
        <KbdGroup className="ml-auto shrink-0">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </button>
      {/* `CommandDialog` 自带遮罩、居中定位、标题与描述，弹层样式与全站 Dialog 一致。 */}
      <CommandDialog
        open={openState}
        onOpenChange={setOpen}
        title={m.docs_search_label()}
        description={m.docs_search_placeholder()}
        className="max-w-xl"
      >
        {/* `label` 会成为输入框的 `aria-labelledby` 目标，缺了它 combobox 没有可访问名。 */}
        <Command label={m.docs_search_label()} shouldFilter={false} className="rounded-xl">
          <CommandInput
            aria-controls={listId}
            placeholder={m.docs_search_placeholder()}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList id={listId} className="max-h-[60vh]">
            {!hasQuery ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {m.docs_search_hint()}
              </p>
            ) : results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {m.docs_search_empty()}
              </p>
            ) : (
              <ul className="space-y-1">
                {results.map((result) => (
                  <li key={result.doc.slug}>
                    <SearchResult result={result} locale={locale} onSelect={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}

function SearchResult({
  result,
  locale,
  onSelect,
}: {
  result: DocSearchResult
  locale: Locale
  onSelect: () => void
}) {
  const { doc, sections, keyword } = result
  const Icon = DOC_ICON[doc.slug] ?? DOC_FALLBACK_ICON

  return (
    <div className="rounded-md">
      <Link
        to="/{-$locale}/docs/$slug"
        params={{ slug: doc.slug, locale }}
        // 文档页之间是客户端跳转，布局（以及这个弹窗）不会卸载，必须手动关闭。
        onClick={onSelect}
        className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground group-hover:text-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            <Highlight text={doc.title} keyword={keyword} />
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            <Highlight text={doc.description} keyword={keyword} />
          </span>
        </span>
      </Link>
      {sections.length > 0 && (
        // 命中的小节按 h2 → h3 层级缩进，形成通往命中点的目录树。
        <ul className="mt-0.5 mb-1 ml-[3.25rem] space-y-0.5 border-l border-border pl-2">
          {sections.map((section) => (
            // 与右侧目录同一约定：锚点 id 即稳定身份。无标题的「正文开头」项没有
            // id，至多出现一次，用固定 key。
            <li key={section.id === '' ? 'intro' : section.id}>
              {section.text === '' ? (
                <p className="py-1 text-xs text-muted-foreground">
                  <Highlight text={section.snippet} keyword={keyword} />
                </p>
              ) : (
                <SectionLink
                  doc={doc}
                  locale={locale}
                  section={section}
                  keyword={keyword}
                  onSelect={onSelect}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SectionLink({
  doc,
  locale,
  section,
  keyword,
  onSelect,
}: {
  doc: DocEntry
  locale: Locale
  section: { id: string; text: string; level: 2 | 3; snippet: string }
  keyword: string
  onSelect: () => void
}) {
  return (
    <Link
      to="/{-$locale}/docs/$slug"
      params={{ slug: doc.slug, locale }}
      hash={section.id}
      onClick={onSelect}
      data-level={section.level}
      className={`block rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
        section.level === 3 ? 'pl-5' : ''
      }`}
    >
      <span className="flex items-center gap-1.5">
        {section.level === 3 && (
          <IconCornerDownRight className="size-3 shrink-0 opacity-60" aria-hidden />
        )}
        <span className="truncate font-medium">
          <Highlight text={section.text} keyword={keyword} />
        </span>
      </span>
      {section.snippet !== '' && (
        <span className="mt-0.5 block truncate opacity-80">
          <Highlight text={section.snippet} keyword={keyword} />
        </span>
      )}
    </Link>
  )
}

/**
 * 把文本里命中关键词的片段包进 `<mark>`。
 *
 * 用 `<mark>` 而不是自定义 `<span>`：它自带语义与浏览器默认底色，读屏软件也能把
 * 高亮部分读成「已标记」，样式失效时仍能看出哪段是命中。匹配大小写不敏感（用户
 * 常输入小写，正文里却是大写），但**保留原文大小写**显示。
 */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  if (keyword === '') return <>{text}</>

  const lowerText = text.toLowerCase()
  const lowerKeyword = keyword.toLowerCase()
  const parts: ReactNode[] = []

  let cursor = 0
  let at = lowerText.indexOf(lowerKeyword)
  while (at !== -1) {
    if (at > cursor) parts.push(text.slice(cursor, at))
    parts.push(
      <mark key={at} className="rounded-sm bg-primary/20 px-0.5 text-inherit">
        {text.slice(at, at + keyword.length)}
      </mark>,
    )
    cursor = at + keyword.length
    at = lowerText.indexOf(lowerKeyword, cursor)
  }

  if (parts.length === 0) return <>{text}</>
  parts.push(text.slice(cursor))
  return <>{parts}</>
}
