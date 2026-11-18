import { DocNextSteps } from '@/components/docs/DocNextSteps'
import { DocPager } from '@/components/docs/DocPager'
import { DocsToc } from '@/components/docs/DocsToc'
import { Mdx } from '@/components/mdx/Mdx'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import type { DocHeading, DocNeighbor, NextStep } from '@/modules/docs/service'

/** 一篇文档渲染所需的全部数据；由路由的 loader 产出，组件自己不取数。 */
export interface DocArticleData {
  title: string
  description: string
  /** 已切掉「下一步」小节的正文。 */
  body: string
  steps: NextStep[]
  prev: DocNeighbor | undefined
  next: DocNeighbor | undefined
  /** 按当前语言格式化后的更新日期；空串表示不渲染该行。 */
  updated: string
  headings: DocHeading[]
}

/**
 * 单篇文档的正文渲染：标题、描述、更新日期、正文、「下一步」卡片与上下篇翻页。
 *
 * `/docs`（文档首页）与 `/docs/$slug`（其余文档）共用本组件：两者的差别只在
 * 「取哪一篇文档」，渲染必须一致，否则首页会缺翻页或缺右侧目录。
 */
export function DocArticle({ doc, locale }: { doc: DocArticleData; locale: Locale }) {
  return (
    <div className="mx-auto flex max-w-5xl justify-center gap-10">
      <article className="max-w-3xl min-w-0 flex-1">
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-muted-foreground">{doc.description}</p>
        {doc.updated !== '' && (
          <p className="mt-2 text-xs text-muted-foreground">
            {m.docs_updated_at()} {doc.updated}
          </p>
        )}
        <hr className="my-6 border-border" />
        <Mdx source={doc.body} />
        <DocNextSteps steps={doc.steps} locale={locale} />
        <DocPager locale={locale} prev={doc.prev} next={doc.next} />
      </article>
      <aside className="sticky top-20 hidden h-fit w-56 shrink-0 xl:block">
        <DocsToc headings={doc.headings} />
      </aside>
    </div>
  )
}
