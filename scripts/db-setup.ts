/**
 * 按 `DATABASE_PROVIDER` 生成数据库 schema 与首份迁移。
 *
 * 用法：`pnpm db:setup`
 *
 * 做三件事：
 * 1. 把对应方言的手写 schema 复制成生成物 `src/core/db/schema.ts`；
 * 2. 该方言还没有迁移时，生成首份基线迁移（两个方言各一个目录）；
 * 3. 打印当前生效的 provider / 方言 / 迁移目录。
 *
 * 为什么用 `.ts` 而不是 `.mjs`：provider 映射必须与 `src/core/db/provider.ts`
 * 一致（两份定义迟早漂移），共用同一个模块才有一致性；仓库内其他脚本也都是 tsx 跑的。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveDatabaseProvider, schemaFileOf } from '../src/core/db/provider'
import { planSchemaSetup } from '../src/core/db/setup'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const dbDir = join(repoRoot, 'src/core/db')

/** 迁移目录（相对 `src/core/db/migrations`）。 */
function migrationDirPath(migrationDir: string): string {
  return join(dbDir, 'migrations', migrationDir)
}

/** 该方言是否已有迁移 SQL。 */
function hasMigrations(migrationDir: string): boolean {
  const dir = migrationDirPath(migrationDir)
  if (!existsSync(dir)) {
    return false
  }
  return readdirSync(dir).some((file) => file.endsWith('.sql'))
}

/**
 * 生成首份基线迁移。
 *
 * 迁移**不入库**：每个 clone / 每种方言的首份迁移都在本地生成，
 * 后续 schema 变更同样本地生成 + 手工 apply。
 */
function generateBaselineMigrations(provider: string): boolean {
  const result = spawnSync(
    'pnpm',
    ['exec', 'drizzle-kit', 'generate', '--config=drizzle.config.ts'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_PROVIDER: provider },
    },
  )
  return result.status === 0
}

export function run(env: NodeJS.ProcessEnv = process.env): number {
  const provider = resolveDatabaseProvider(env.DATABASE_PROVIDER)
  const targetPath = join(dbDir, 'schema.ts')

  const sourcePath = join(dbDir, schemaFileOf(provider))
  if (!existsSync(sourcePath)) {
    console.error(`找不到手写 schema：${sourcePath}`)
    return 1
  }

  const targetContent = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null
  const plan = planSchemaSetup({ provider, targetContent })

  if (plan.needsWrite) {
    writeFileSync(targetPath, plan.targetContent, 'utf8')
    console.log(`已生成 schema：${plan.targetFileName} → ${plan.sourceFileName}`)
  } else {
    console.log(`schema 已是最新：${plan.targetFileName} → ${plan.sourceFileName}`)
  }

  if (hasMigrations(plan.migrationDir)) {
    console.log(`迁移已存在：src/core/db/migrations/${plan.migrationDir}`)
  } else {
    console.log(`生成基线迁移：src/core/db/migrations/${plan.migrationDir}`)
    mkdirSync(migrationDirPath(plan.migrationDir), { recursive: true })
    if (!generateBaselineMigrations(provider)) {
      console.error('基线迁移生成失败')
      return 1
    }
  }

  console.log(
    `provider=${provider} 方言=${plan.dialect} 迁移目录=src/core/db/migrations/${plan.migrationDir}`,
  )
  return 0
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invokedDirectly) {
  process.exit(run())
}
