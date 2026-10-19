import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('表头带底色、外层容器带边框与圆角（由 globals.css 统一补齐）', () => {
    // ui/table 上游的 TableHeader 只有 `[&_tr]:border-b`、TableHead 无背景、Table 根无
    // border。这三样以前写在 Mdx.tsx 的调用处，工作台的六处表格又各自没写——同一种
    // 组件两种表头。现在统一收到 globals.css 的 `[data-slot='table-*']` 规则，
    // 调用处不再写边框 / 底色；这里断言「集中规则存在 + 调用处干净」。
    render(<Mdx source={['| 字段 | 类型 |', '| --- | --- |', '| name | string |'].join('\n')} />)
    const table = screen.getByRole('table')

    // 表头与滚动容器自带 data-slot，集中规则按它们选人。
    const container = table.closest('[data-slot="table-container"]')
    expect(container).not.toBeNull()
    for (const head of within(table).getAllByRole('columnheader')) {
      expect(head).toHaveAttribute('data-slot', 'table-head')
    }

    // 测试跑在 jsdom 里，`import.meta.url` 不是 file: URL，改用 cwd 定位仓库根。
    const globals = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf-8')
    expect(globals).toMatch(/\[data-slot=['"]table-container['"]\]\s*\{[^}]*border:/)
    expect(globals).toMatch(/\[data-slot=['"]table-container['"]\]\s*\{[^}]*border-radius:/)
    // 底色挂在 thead 上（`table-header`），不是每个 th——按 shadcn dashboard-01 的写法。
    // 同时带吸顶：`sticky` 与 `top-0` 必须成对出现，缺一个都吸不住。
    expect(globals).toMatch(/\[data-slot=['"]table-header['"]\]\s*\{[^}]*background-color:/)
    expect(globals).toMatch(/\[data-slot=['"]table-header['"]\]\s*\{[^}]*position:\s*sticky/)
    expect(globals).toMatch(/\[data-slot=['"]table-header['"]\]\s*\{[^}]*top:\s*0/)

    // 调用处不再重复定义外框 / 底色，只保留隔离 typography 的 `not-prose`。
    const wrapper = table.closest('.not-prose')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).not.toContain('border-border')
    expect(wrapper?.className).not.toContain('rounded-lg')
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

/**
 * 代码块：语言标签与复制按钮。
 *
 * 没有复制按钮时，读者只能手动选中——在 `bash` 多行命令上尤其容易漏掉续行符。
 * 断言落在 shadcn 原件的 `data-slot` 契约上，而不是自造的类名。
 */
describe('Mdx 代码块', () => {
  const SOURCE = ['```bash', 'pnpm install', 'pnpm dev', '```'].join('\n')

  it('代码块带语言标签', () => {
    render(<Mdx source={SOURCE} />)
    const block = document.querySelector('[data-slot="code-block"]')
    expect(block).not.toBeNull()
    expect(
      within(block as HTMLElement).getByText('bash', {
        selector: '[data-slot="code-block-title"]',
      }),
    ).toBeInTheDocument()
  })

  it('代码块带复制按钮，且复制的是完整原文', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(<Mdx source={SOURCE} />)
    const button = screen.getByRole('button', { name: 'Copy code' })
    button.click()
    expect(writeText).toHaveBeenCalledWith('pnpm install\npnpm dev')
  })

  it('无语言围栏也渲染标题栏（显示「代码」）与复制按钮', () => {
    render(<Mdx source={['```', 'echo hi', '```'].join('\n')} />)
    // 标题栏承担「与正文分割」的职责，因此无语言时也保留，只是文案退化为「代码」。
    expect(document.querySelector('[data-slot="code-block-header"]')).not.toBeNull()
    expect(
      screen.getByText('Code', { selector: '[data-slot="code-block-title"]' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })

  it('围栏带 title= 时标题栏显示文件名', () => {
    render(
      <Mdx source={['```jsonc title="wrangler.jsonc"', '{ "name": "x" }', '```'].join('\n')} />,
    )
    expect(
      screen.getByText('wrangler.jsonc', { selector: '[data-slot="code-block-title"]' }),
    ).toBeInTheDocument()
  })

  it('代码正文原样保留，不被行内语法改写', () => {
    render(<Mdx source={['```ts', 'const a = `x`', 'const b = **not bold**', '```'].join('\n')} />)
    const code = document.querySelector('[data-slot="code-block-content"] code')
    expect(code?.textContent).toBe('const a = `x`\nconst b = **not bold**')
  })
})

/**
 * 步骤时间线。
 *
 * 判定规则是「某个 `##` 之后成组出现 `###`」——孤立的 `###`（同级小节，如
 * 「验证链接 / 重置链接」）必须保持普通标题，否则会凭空套上编号。
 */
describe('Mdx 步骤时间线', () => {
  const STEPS = [
    '## 设置',
    '### 第一步',
    '先建 bucket。',
    '```bash',
    'wrangler r2 bucket create x',
    '```',
    '### 第二步',
    '再绑 binding。',
    '## 下一步',
    '到这里结束。',
  ].join('\n')

  it('连续的两个以上 ### 渲染为带编号的时间线', () => {
    render(<Mdx source={STEPS} />)
    const steps = document.querySelectorAll('.mdx-step')
    expect(steps).toHaveLength(2)
    expect(steps[0]?.querySelector('.mdx-step-number')?.textContent).toBe('1')
    expect(steps[1]?.querySelector('.mdx-step-number')?.textContent).toBe('2')
    // 正文留在各自步骤内，不跑到时间线外面。
    expect(steps[0]?.textContent).toContain('先建 bucket')
    expect(steps[1]?.textContent).toContain('再绑 binding')
  })

  it('时间线里的标题仍是 h3 且带锚点 id（目录与深链依赖它）', () => {
    render(<Mdx source={STEPS} />)
    const heading = document.querySelector('.mdx-step h3')
    expect(heading?.tagName).toBe('H3')
    expect(heading?.id).toBe('第一步')
  })

  it('孤立的单个 ### 保持普通标题，不套时间线', () => {
    render(<Mdx source={['## 会话', '### 验证链接', '说明。', '## 下一节', '正文。'].join('\n')} />)
    expect(document.querySelector('.mdx-step')).toBeNull()
    expect(document.querySelector('h3')?.textContent).toBe('验证链接')
  })
})
