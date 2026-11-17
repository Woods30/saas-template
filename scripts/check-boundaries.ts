/**
 * 模块边界检查：core / modules / routes 三层的依赖方向由这里守。
 *
 * 规则（与 AGENTS.md 的「模块边界」一节对应）：
 * - core 不得依赖 modules 或 routes；
 * - modules 不得依赖 routes；
 * - 模块之间只能通过对方 `service.ts` 交互，不能穿透到内部文件；
 * - 模块根路径本身不算入口（不存在 index.ts）。
 *
 * 检查是纯函数 + 一个 CLI 外壳，便于在单测里直接构造用例，不必碰磁盘。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export interface SourceFile {
  /** 仓库相对路径，统一用 `/` 分隔。 */
  path: string
  content: string
}

export type RuleName =
  | 'core-imports-module'
  | 'core-imports-route'
  | 'module-imports-route'
  | 'module-public-entry'

export interface Violation {
  file: string
  specifier: string
  rule: RuleName
  message: string
}

const MODULES_PREFIX = '@/modules/'
const ROUTES_PREFIX = '@/routes/'

/** 允许的模块公开入口（含显式扩展名写法）。 */
const PUBLIC_ENTRY_FILES = new Set(['service', 'service.ts', 'service.tsx'])

/** 统一路径分隔符，去掉 `./` 前缀。 */
export function normalizePath(file: string): string {
  return file.split(sep).join('/').replace(/^\.\//, '')
}

/** 文件所属模块 id；不在 `src/modules/<id>/` 下时返回 null。 */
export function moduleOf(file: string): string | null {
  const matched = /^src\/modules\/([^/]+)\//.exec(file)
  return matched?.[1] ?? null
}

/**
 * 提取 import / re-export / 动态 import 的模块说明符。
 *
 * 只匹配静态字符串；相对路径与外部包会原样返回，由调用方决定是否关心。
 */
export function importSpecifiers(content: string): string[] {
  const specifiers: string[] = []
  const pattern = /(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g
  for (const matched of content.matchAll(pattern)) {
    const specifier = matched[1]
    if (specifier) specifiers.push(specifier)
  }
  return specifiers
}

/** 检查一批源文件，返回违例清单（顺序与输入一致）。 */
export function findBoundaryViolations(files: readonly SourceFile[]): Violation[] {
  const violations: Violation[] = []

  for (const raw of files) {
    const file = normalizePath(raw.path)
    const owner = moduleOf(file)
    const inCore = file.startsWith('src/core/')

    for (const specifier of importSpecifiers(raw.content)) {
      if (inCore && specifier.startsWith(MODULES_PREFIX)) {
        violations.push({
          file,
          specifier,
          rule: 'core-imports-module',
          message: 'core 不得依赖 modules：基础设施不能反向依赖业务模块',
        })
        continue
      }

      if (inCore && specifier.startsWith(ROUTES_PREFIX)) {
        violations.push({
          file,
          specifier,
          rule: 'core-imports-route',
          message: 'core 不得依赖 routes：页面与接口不属于基础设施',
        })
        continue
      }

      if (owner !== null && specifier.startsWith(ROUTES_PREFIX)) {
        violations.push({
          file,
          specifier,
          rule: 'module-imports-route',
          message: 'modules 不得依赖 routes：业务模块不能引用页面或接口',
        })
        continue
      }

      if (!specifier.startsWith(MODULES_PREFIX)) continue

      const [target, ...segments] = specifier.slice(MODULES_PREFIX.length).split('/')
      if (!target) continue

      // 模块内部可以自由引用自己目录下的任何文件。
      if (owner !== null && target === owner) continue

      const entry = segments.join('/')
      if (PUBLIC_ENTRY_FILES.has(entry)) continue

      violations.push({
        file,
        specifier,
        rule: 'module-public-entry',
        message: `模块 \`${target}\` 只暴露 service.ts，不能导入 ${entry || '模块根路径'}`,
      })
    }
  }

  return violations
}

/** 递归收集 `src` 下的 TypeScript 源文件。 */
export function collectSourceFiles(root = 'src'): SourceFile[] {
  const files: SourceFile[] = []
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (!/\.tsx?$/.test(entry.name)) continue
    const absolute = join(entry.parentPath, entry.name)
    files.push({
      path: normalizePath(relative('.', absolute)),
      content: readFileSync(absolute, 'utf-8'),
    })
  }
  return files
}

function main(): void {
  const violations = findBoundaryViolations(collectSourceFiles())

  if (violations.length === 0) {
    console.log('模块边界检查通过。')
    return
  }

  for (const violation of violations) {
    console.error(`${violation.file}: ${violation.message}（${violation.specifier}）`)
  }
  console.error(`\n共 ${violations.length} 处边界违例。`)
  process.exit(1)
}

// 仅在直接执行时跑 CLI，被单测 import 时不做任何事。
if (process.argv[1]?.endsWith('check-boundaries.ts')) main()
