import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 硬编码配色守卫。
 *
 * 站点的所有颜色都必须来自 `src/styles/globals.css` 的语义 token（`bg-primary`、
 * `text-muted-foreground`…）。绕过 token 写死色阶或十六进制值有两个后果：
 * 换主题时这些地方不跟着变，明暗切换下还可能直接失去对比度——而两者都不会让
 * 任何功能测试失败，只在截图里看得出来。
 *
 * 扫描范围排除两类文件：
 * - `src/components/ui/`：shadcn 上游原件，本地不修改（见 AGENT.md 关键不变量）；
 * - `src/mail/`：邮件客户端不执行站点 CSS，颜色必须是字面量，由 `EMAIL_THEME` 集中管理。
 */

const ROOT = new URL('../../src', import.meta.url).pathname

/** 允许出现字面量颜色的目录（相对 `src/`）。 */
const EXEMPT_DIRS = ['components/ui/', 'mail/']

/**
 * 允许出现字面量颜色的单个文件（相对 `src/`）。
 *
 * - `components/icons/LocaleFlags.tsx`：国旗的配色是法定识别色，不能跟主题走；
 * - `config/website.ts`：`ui.themeColor` 由浏览器在页面之外渲染（地址栏、状态栏），
 *   读不到 CSS 变量，只能写字面量。它与 `--background` 的一致性由
 *   `theme-colors.test.ts` 守住。
 */
const EXEMPT_FILES = ['components/icons/LocaleFlags.tsx', 'config/website.ts']

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

/** 十六进制 / rgb / hsl 字面量。注释里出现色值是说明文字，不算违规。 */
const COLOR_LITERAL = /(?<![\w-])#[0-9a-fA-F]{3,8}(?![\w-])|\brgba?\(|\bhsla?\(/

/** Tailwind 的具体色阶（`bg-gray-500`、`text-zinc-100`…），不含语义 token。 */
const PALETTE_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|decoration|caret|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/

/** 去掉注释，避免把说明性文字里的色值算成违规。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('配色只走主题 token', () => {
  it('业务代码里没有十六进制 / rgb / hsl 字面量', () => {
    const offenders = files
      .filter(({ path }) => COLOR_LITERAL.test(stripComments(readFileSync(path, 'utf-8'))))
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })

  it('业务代码里没有 Tailwind 具体色阶', () => {
    const offenders = files
      .filter(({ path }) => PALETTE_CLASS.test(stripComments(readFileSync(path, 'utf-8'))))
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })

  it('业务代码里没有内联颜色样式', () => {
    // `style={{ animationDelay }}` 这类非颜色的内联样式是允许的，
    // 只有颜色属性（background / color / border…）走内联才算绕过主题。
    const INLINE_COLOR = /style=\{\{[^}]*(?:background|color|borderColor|fill|stroke)\s*:/s
    const offenders = files
      .filter(({ path }) => INLINE_COLOR.test(stripComments(readFileSync(path, 'utf-8'))))
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })
})

/**
 * 邮件模板的配色快照。
 *
 * 邮件读不到站点 CSS，`EMAIL_THEME` 是主题的静态副本。这份副本与 `globals.css`
 * 的浅色档之间没有任何运行时联系，改主题时极容易漏改——这里把两者绑起来。
 */
describe('邮件配色与主题同步', () => {
  const globals = readFileSync(join(ROOT, 'styles/globals.css'), 'utf-8')
  const layout = readFileSync(join(ROOT, 'mail/components/EmailLayout.tsx'), 'utf-8')

  /** 从 globals.css 取某个 token 的浅色档 hex（与 theme-colors.test.ts 同一套换算）。 */
  function lightHex(token: string): string {
    const match = globals.match(
      new RegExp(`--${token}:\\s*light-dark\\(\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
    )
    if (!match) throw new Error(`globals.css 中找不到 --${token} 的浅色 oklch 值`)
    return oklchToHex(Number(match[1]), Number(match[2]), Number(match[3]))
  }

  it.each([
    ['background', 'background'],
    ['foreground', 'foreground'],
    ['primary', 'primary'],
    ['primary-foreground', 'primaryForeground'],
    ['muted-foreground', 'mutedForeground'],
    ['border', 'border'],
  ])('EMAIL_THEME.%s 与 --%s 的浅色档一致', (token, key) => {
    const declared = layout.match(new RegExp(`${key}:\\s*'(#[0-9A-Fa-f]{6})'`))
    expect(declared?.[1]).toBeDefined()
    expect(declared?.[1]?.toUpperCase()).toBe(lightHex(token))
  })
})

function oklchToHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b

  const l3 = lPrime ** 3
  const m3 = mPrime ** 3
  const s3 = sPrime ** 3

  return `#${[
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
    .map((channel) => {
      const clamped = Math.min(1, Math.max(0, channel))
      const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
      return Math.round(encoded * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase()
    })
    .join('')}`
}
