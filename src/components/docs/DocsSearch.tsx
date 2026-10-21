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
 * 文档搜索：侧栏触发器 + 居中弹窗（240px 侧栏放不下结果）。检索是纯前端的，
 * 输入关键词后才给结果。开合可由父级接管，窄屏顶栏与侧栏要打开同一个弹窗。
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
      // 关闭时清空查询，下次打开是干净的起点。
      if (!next) setQuery('')
    },
    [isControlled, onOpenChange],
  )

  // ⌘K / Ctrl+K 必须真的可用——搜索框上标注了它。依赖 `openState`：弹窗已开时不再抢快捷键。
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
        <KbdGroup className="ml-auto shrink-0">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </button>
      <CommandDialog
        open={openState}
        onOpenChange={setOpen}
        title={m.docs_search_label()}
        description={m.docs_search_placeholder()}
        className="max-w-xl"
      >
        {/* `label` 是输入框的 `aria-labelledby` 目标，缺了 combobox 没有可访问名。 */}
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
        // 文档页之间是客户端跳转，布局不会卸载，必须手动关闭弹窗。
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
        <ul className="mt-0.5 mb-1 ml-[3.25rem] space-y-0.5 border-l border-border pl-2">
          {sections.map((section) => (
            // 无标题的「正文开头」项没有 id，至多出现一次，用固定 key。
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
 * 把命中关键词的片段包进 `<mark>`（自带语义与默认底色）。匹配大小写不敏感，
 * 但保留原文大小写显示。
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
