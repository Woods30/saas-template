import { IconArrowRight, IconRoute } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { DOC_FALLBACK_ICON, DOC_ICON } from '@/components/docs/doc-icons'
import { docLinkTarget, type NextStep } from '@/lib/docs'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 正文末尾的「下一步」卡片。与线性的「上一篇 / 下一篇」刻意区分：这里是作者挑选的
 * 分支链接，因此带目标文档图标与强调色。站内相对链接走文档路由，切换语言后仍指向译文。
 */
export function DocNextSteps({ steps, locale }: { steps: NextStep[]; locale: Locale }) {
  if (steps.length === 0) return null

  return (
    <section className="mt-12">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <IconRoute className="size-4" aria-hidden />
        {m.docs_next_steps()}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={`${step.href}-${step.title}`}>
            <StepCard step={step} locale={locale} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function StepCard({ step, locale }: { step: NextStep; locale: Locale }) {
  const target = docLinkTarget(step.href)
  const Icon = (target && DOC_ICON[target.slug]) || DOC_FALLBACK_ICON
  const isExternal = target === undefined

  const className =
    'group flex h-full items-start gap-3 rounded-xl border border-border bg-gradient-to-br from-primary/[0.07] to-transparent p-3.5 transition-all hover:border-primary/40 hover:shadow-sm'

  const content = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold">
          <span className="truncate">{step.title}</span>
          {isExternal && (
            <IconArrowRight
              className="size-3.5 shrink-0 -rotate-45 text-muted-foreground"
              aria-hidden
            />
          )}
        </span>
        {step.description !== '' && (
          // 说明可能带行内 code 标记，这里去掉标记按纯文本展示。
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {step.description.replace(/`([^`]+)`/g, '$1')}
          </span>
        )}
      </span>
      <IconArrowRight
        className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden
      />
    </>
  )

  if (target === undefined) {
    return (
      <a
        href={step.href}
        className={className}
        {...(isExternal ? { rel: 'noopener noreferrer' } : {})}
      >
        {content}
      </a>
    )
  }

  return (
    <Link
      to="/{-$locale}/docs/$slug"
      params={{ slug: target.slug, locale }}
      hash={target.hash}
      className={className}
    >
      {content}
    </Link>
  )
}
