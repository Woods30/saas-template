import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `.env.example` 与两层 env 校验之间的**双向**对照。
 *
 * 缺一边都会出事：
 * - schema 里有、example 里没有 → 开发者照着 example 抄，漏配了必填项，
 *   到部署那天才发现；
 * - example 里有、代码里没人读 → 开发者填了一堆以为有用、其实没人读的值，
 *   或者反过来：真正需要的值（`CLOUDFLARE_DATABASE_ID` 这类直接读
 *   `process.env` 的）不在 example 里，只能去翻源码。
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

/** 目录下所有 `.ts` / `.tsx` 的内容拼成一个字符串。 */
function readTree(relativeDir: string): string {
  return readdirSync(join(repoRoot, relativeDir), { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .map((name) => readFileSync(join(repoRoot, relativeDir, name), 'utf8'))
    .join('\n')
}

/** `.env.example` 里声明的变量名（忽略注释与空行）。 */
function envExampleKeys(): string[] {
  return readRepoFile('.env.example')
    .split('\n')
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter((key): key is string => key !== undefined)
}

/** 两层 env schema 里声明的变量名。 */
function schemaKeys(): string[] {
  const source = [
    readRepoFile('src/core/env/public.ts'),
    readRepoFile('src/core/env/server.ts'),
  ].join('\n')
  return [...source.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):\s*z\b/gm)].map((match) => match[1] as string)
}

describe('.env.example 的完整性', () => {
  it('每个变量都有读取点', () => {
    // drizzle 配置直接读 `process.env`，绕开 `src/env` 的两层校验，故单独并入扫描范围。
    const source = [
      readTree('src'),
      readRepoFile('drizzle.config.ts'),
      readRepoFile('drizzle.config.local.ts'),
    ].join('\n')

    for (const key of envExampleKeys()) {
      expect(source, `${key} 在 src/ 与 drizzle 配置里都找不到读取点`).toContain(key)
    }
  })

  it('两层 env schema 里的每个变量都在清单里', () => {
    const declared = new Set(envExampleKeys())

    for (const key of schemaKeys()) {
      expect(declared.has(key), `${key} 在 .env.example 里缺席`).toBe(true)
    }
  })
})
