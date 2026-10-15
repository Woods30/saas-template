import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Mdx } from '@/components/mdx/Mdx'

/**
 * Mdx 渲染器的块级与行内语法。
 *
 * 背景：配置文档大量使用「字段 / 类型 / 默认值 / 说明」表格与站内交叉链接；
 * 渲染器此前只支持标题、代码块与段落，表格会被当成普通段落输出成一行竖线，
 * 链接则原样显示 `[文字](地址)`。这里把这两类语法定住。
 */

afterEach(cleanup)

describe('Mdx 表格', () => {
  it('把 markdown 表格渲染为 ui/table 结构', () => {
    render(<Mdx source={['| 字段 | 类型 |', '| --- | --- |', '| name | string |'].join('\n')} />)
    const table = screen.getByRole('table')
    // ui/table 的 Table 根带 data-slot="table"（外层容器是 table-container）。
    expect(table).toHaveAttribute('data-slot', 'table')
    const columnHeaders = within(table).getAllByRole('columnheader')
    expect(columnHeaders.map((c) => c.textContent)).toEqual(['字段', '类型'])
  })

  it('表头带底色、外层容器带边框与圆角（调用处补齐 ui/table 缺失的视觉）', () => {
    // ui/table 上游的 TableHeader 只有 `[&_tr]:border-b`、TableHead 无背景、Table 根无
    // border——「表头底色 + 外框」由调用处（Mdx.tsx）补，故钉死调用处契约而非 ui 原件。
    render(<Mdx source={['| 字段 | 类型 |', '| --- | --- |', '| name | string |'].join('\n')} />)
    const table = screen.getByRole('table')
    for (const head of within(table).getAllByRole('columnheader')) {
      expect(head.className).toContain('bg-muted/50')
    }
    // 外框落在包裹 Table 的容器上（Table 内部自带 overflow-x-auto 容器）。
    const wrapper = table.closest('.not-prose')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain('border')
    expect(wrapper?.className).toContain('rounded-lg')
  })

  it('分隔行不产生数据行，也不会渲染出多余的行', () => {
    render(<Mdx source={['| A |', '|---|', '| 1 |', '| 2 |'].join('\n')} />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(3) // 表头 + 2 数据行
    expect(table.textContent).not.toContain('---')
  })

  it('表头单元格内的行内代码仍被解析', () => {
    render(<Mdx source={['| `metadata.name` | 说明 |', '|---|---|'].join('\n')} />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader')[0]?.querySelector('code')?.textContent).toBe(
      'metadata.name',
    )
  })

  it('同一行出现重复单元格值时仍产生唯一 key（无 React 重复 key 警告）', () => {
    // 配置表里 `'stripe'` 会同时出现在「类型」与「默认值」两列，若直接用单元格
    // 文本作 key 就会撞车，React 会打印重复 key 警告并可能丢弃单元格。
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(
        <Mdx
          source={[
            '| 字段 | 类型 | 默认值 |',
            '|---|---|---|',
            "| provider | 'stripe' | 'stripe' |",
          ].join('\n')}
        />,
      )
      const table = screen.getByRole('table')
      expect(
        within(table)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ).toEqual(['provider', "'stripe'", "'stripe'"])
      const dupKeyWarnings = spy.mock.calls.filter((args) => String(args[0]).includes('same key'))
      expect(dupKeyWarnings).toEqual([])
    } finally {
      spy.mockRestore()
    }
  })
})

describe('Mdx 无序列表', () => {
  it('把连续的 `- ` 行渲染为 ul / li', () => {
    render(<Mdx source={['- 第一条', '- 第二条'].join('\n')} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['第一条', '第二条'])
  })

  it('列表项中的行内代码仍被解析', () => {
    render(<Mdx source="- 使用 `pnpm check`" />)
    expect(screen.getByRole('listitem').querySelector('code')?.textContent).toBe('pnpm check')
  })
})

describe('Mdx 行内链接', () => {
  it('把 [文字](地址) 渲染为带 href 的 a 元素', () => {
    render(<Mdx source="参见 [网站配置](./configuration)。" />)
    const link = screen.getByRole('link', { name: '网站配置' })
    expect(link).toHaveAttribute('href', './configuration')
  })

  it('绝对地址渲染为外链并带 rel 保护', () => {
    render(<Mdx source="[示例](https://example.com)" />)
    const link = screen.getByRole('link', { name: '示例' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('链接文字中的粗体仍被解析', () => {
    render(<Mdx source="[**重要**说明](./a)" />)
    const link = screen.getByRole('link')
    expect(link.querySelector('strong')?.textContent).toBe('重要')
  })
})

describe('Mdx 标题锚点', () => {
  // 右侧目录靠 `href="#id"` 跳转，标题必须带同样的 id，否则点击无效。
  it('h2 / h3 带与 headingId 一致的锚点 id', () => {
    render(<Mdx source={['## 准备开发环境', '', '### 使用 `pnpm check`'].join('\n')} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('id', '准备开发环境')
    expect(screen.getByRole('heading', { level: 3 })).toHaveAttribute('id', '使用-pnpm-check')
  })
})

describe('Mdx 有序列表', () => {
  it('把连续的 `1. ` 行渲染为 ol / li', () => {
    render(<Mdx source={['1. 第一步', '2. 第二步', '3. 第三步'].join('\n')} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['第一步', '第二步', '第三步'])
    expect(screen.getByRole('list')).toBeTruthy()
  })

  it('有序列表项中的行内代码与粗体仍被解析', () => {
    render(<Mdx source={'1. 运行 `pnpm check` 并查看 **输出**'} />)
    const item = screen.getByRole('listitem')
    expect(item.querySelector('code')?.textContent).toBe('pnpm check')
    expect(item.querySelector('strong')?.textContent).toBe('输出')
  })
})

describe('Mdx 引用块', () => {
  // 文档用 `> 注意：…` 单独列出注意事项；不支持时这些行会连同 `>` 一起原样输出。
  it('把 `> ` 行渲染为 blockquote', () => {
    render(<Mdx source="> 注意：生产环境必须配置真实域名。" />)
    const quote = screen.getByRole('blockquote')
    expect(quote.textContent).toBe('注意：生产环境必须配置真实域名。')
  })

  it('连续的 `> ` 行合并为一个引用块', () => {
    render(<Mdx source={['> 第一行', '> 第二行'].join('\n')} />)
    expect(screen.getAllByRole('blockquote')).toHaveLength(1)
    expect(screen.getByRole('blockquote').textContent).toBe('第一行 第二行')
  })

  it('引用块内的行内代码仍被解析', () => {
    render(<Mdx source="> 需要 `pnpm check`" />)
    expect(screen.getByRole('blockquote').querySelector('code')?.textContent).toBe('pnpm check')
  })

  it('以 **Note** 开头的引用渲染为 Alert', () => {
    render(<Mdx source="> **Note**: 生产环境必须配置真实域名。" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'alert')
    expect(alert.textContent).toContain('生产环境必须配置真实域名。')
  })

  it('中文「注意事项」开头的引用同样升级为 Alert', () => {
    render(<Mdx source="> **注意事项**：不要泄漏 secret。" />)
    expect(screen.getByRole('alert').textContent).toContain('不要泄漏 secret。')
  })
})

describe('Mdx 链接 scheme 白名单', () => {
  // 正文来自 content/ 下的仓库自有 Markdown，但渲染器是通用组件；一旦内容源变为
  // 用户可写，未校验的 `javascript:` 地址就是 XSS。React 不会拦截该地址（仅开发期告警），
  // 因此必须在渲染前丢弃。
  it('丢弃 javascript: 地址，不产生 a 元素也不泄漏 href', () => {
    const { container } = render(<Mdx source="[点我](javascript:alert(1))" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.innerHTML).not.toContain('javascript:')
    // 链接文字保留（地址里含 `)`，正则会在该处截断，故用子串匹配）。
    expect(screen.getByText(/点我/)).toBeTruthy()
  })

  it('丢弃 data: 地址', () => {
    const { container } = render(<Mdx source="[点我](data:text/html,<script>1</script>)" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.innerHTML).not.toContain('data:')
  })

  it('大小写混写的危险 scheme 同样被丢弃', () => {
    render(<Mdx source="[点我](JaVaScRiPt:alert(1))" />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('保留 http / https / mailto / 相对路径 / 锚点', () => {
    render(
      <Mdx
        source={[
          '[a](http://example.com)',
          '[b](https://example.com)',
          '[c](mailto:a@b.com)',
          '[d](./relative)',
          '[e](#anchor)',
        ].join('\n\n')}
      />,
    )
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      'http://example.com',
      'https://example.com',
      'mailto:a@b.com',
      './relative',
      '#anchor',
    ])
  })
})

describe('Mdx 既有语法不回归', () => {
  it('仍渲染标题、代码块与粗体', () => {
    render(
      <Mdx source={['## 小节', '', '```', 'const a = 1', '```', '', '**粗体**文本'].join('\n')} />,
    )
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('小节')
    expect(screen.getByText('const a = 1')).toBeTruthy()
    expect(screen.getByText('粗体')).toBeTruthy()
  })

  it('丢弃正文开头的重复 h1', () => {
    render(<Mdx source={['# 标题', '', '正文'].join('\n')} />)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})
