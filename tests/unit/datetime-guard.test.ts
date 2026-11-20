import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 日期与时区守卫：**后端统一 UTC，前端渲染才用本地时区**。
 *
 * 服务端（Cloudflare Workers 运行时）固定 UTC，浏览器用用户本地时区。两端渲染
 * 同一份 HTML 会在跨午夜差一天时触发 React 水合失败——整棵树重新生成，页面短暂
 * 不可交互，E2E 里表现为「点击被吞」。这类问题不会被任何功能测试抓到，只能靠
 * 静态守卫。
 *
 * 两条线：
 *
 * 1. **格式化只走 `src/lib/datetime.ts`**：其余业务代码不得直接调用 `toLocale*`。
 *    （`toLocaleString` 带 `style:` 的是数字格式化，放行。）
 * 2. **后端不读本地时区**：不得使用 `getFullYear` / `getMonth` / `getDate` 等
 *    本地时区读取器，一律用 `getUTC*`。
 *
 * 排除 `src/components/ui/`（shadcn 上游原件）与 `src/locale/paraglide/`（生成物）。
 */

const ROOT = new URL('../../src', import.meta.url).pathname

/** 允许直接写日期格式化 / 本地时区读取的目录（相对 `src/`）。 */
const EXEMPT_DIRS = ['components/ui/', 'locale/paraglide/']

/** 允许直接写日期格式化 / 本地时区读取的单个文件（相对 `src/`）。 */
const EXEMPT_FILES = ['lib/datetime.ts']

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(path)
  }
  return out
}

const files = sourceFiles(ROOT)
  .map((path) => ({ path, rel: relative(ROOT, path) }))
  .filter(
    ({ rel }) => !EXEMPT_DIRS.some((dir) => rel.startsWith(dir)) && !EXEMPT_FILES.includes(rel),
  )

/** 去掉注释，避免把说明性文字里的 API 名算成违规。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** 本地时区读取器：`.getFullYear(` 之类；`getUTCFullYear(` 不匹配（前面是 `UTC`）。 */
const LOCAL_DATE_GETTER = /\.get(FullYear|Month|Date|Hours|Minutes|Seconds|Day|TimezoneOffset)\(/

/** 取 `toLocaleString(` 调用的实参文本，用来区分日期格式化与数字格式化。 */
function localeStringArgs(source: string, index: number): string {
  let depth = 0
  for (let i = index; i < source.length; i += 1) {
    const char = source[i]
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return source.slice(index + 1, i)
    }
  }
  return source.slice(index + 1)
}

describe('日期格式化只走 @/lib/datetime', () => {
  it('业务代码里没有 toLocaleDateString / toLocaleTimeString', () => {
    const offenders = files
      .filter(({ path }) =>
        /toLocale(Date|Time)String\(/.test(stripComments(readFileSync(path, 'utf-8'))),
      )
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })

  it('业务代码里没有把 toLocaleString 用在日期上', () => {
    const offenders: string[] = []
    for (const { path, rel } of files) {
      const source = stripComments(readFileSync(path, 'utf-8'))
      let index = source.indexOf('toLocaleString(')
      while (index !== -1) {
        // 带 `style:` 的是数字 / 货币格式化，放行。
        if (!localeStringArgs(source, index).includes('style:')) offenders.push(rel)
        index = source.indexOf('toLocaleString(', index + 1)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('后端只读 UTC', () => {
  it('业务代码里没有本地时区读取器', () => {
    const offenders = files
      .filter(({ path }) => LOCAL_DATE_GETTER.test(stripComments(readFileSync(path, 'utf-8'))))
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })
})

describe('数据库时间戳是 UTC', () => {
  /**
   * `src/core/db/schema.ts` 是生成物（`pnpm db:setup` 按 provider 复制方言 schema），
   * 守卫要盯的是**两份方言源码**——生成物随时会被覆盖，盯它等于没盯。
   */
  const sqliteSchema = readFileSync(join(ROOT, 'core/db/schema.sqlite.ts'), 'utf-8')
  const postgresSchema = readFileSync(join(ROOT, 'core/db/schema.postgres.ts'), 'utf-8')

  it('不用随连接本地时区解释的时间函数', () => {
    // `datetime('now')` 存的是没有时区标记的字符串，JS 会按本地时区解析它。
    for (const schema of [sqliteSchema, postgresSchema]) {
      expect(schema).not.toMatch(/localtime/i)
      expect(schema).not.toMatch(/datetime\s*\(\s*'now'/i)
    }
  })

  it('SQLite 默认时间戳取 Unix 秒', () => {
    expect(sqliteSchema).toContain('unixepoch()')
  })

  it('Postgres 默认时间戳交给数据库的 now()', () => {
    // PG 的 `timestamp with time zone` 本身就带时区，不该再套 `unixepoch()`。
    expect(postgresSchema).toContain('defaultNow()')
    expect(postgresSchema).not.toContain('unixepoch()')
  })
})
