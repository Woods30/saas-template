/**
 * schema 生成物的写入计划（纯函数，无 IO）。
 *
 * `src/core/db/schema.ts` 是**生成物**：按 provider 指向对应方言的手写 schema。
 * 手写 schema 不能直接被业务代码 import——它们的表定义来自不同的 drizzle 模块
 * （`sqlite-core` 与 `pg-core` 互不通用），生成物让全仓只有一份 schema 入口。
 *
 * 生成物不是复制品而是一行重导出（`export * from './schema.sqlite'`）：
 * - 类型不漂移：生成物与手写文件始终是同一份类型；
 * - 体积小：diff 只看一行，切方言时一眼能看出改了什么；
 * - 方言自描述：手写 schema 各自导出 `SCHEMA_DIALECT`，运行期据此校验
 *   「生成时的方言」与「运行时声明的 provider」是否一致。
 *
 * 生成物不入库，所以每次 clone / 切方言都要重新生成；本模块只回答
 * 「这次要不要写文件」，真正的读写在 `scripts/db-setup.ts`。
 */
import { type DatabaseProvider, dialectOf, type MigrationDir, schemaFileOf } from './provider'

export interface SchemaSetupInput {
  provider: DatabaseProvider
  /** 生成物当前内容；不存在时传 null。 */
  targetContent: string | null
}

export interface SchemaSetupPlan {
  provider: DatabaseProvider
  dialect: ReturnType<typeof dialectOf>
  migrationDir: MigrationDir
  /** 源文件名（相对 `src/core/db/`）。 */
  sourceFileName: string
  /** 生成物文件名（相对 `src/core/db/`）。 */
  targetFileName: string
  /** 生成物应有的内容。 */
  targetContent: string
  /** 内容是否需要写入。false 表示生成物已是目标内容，不动文件。 */
  needsWrite: boolean
}

export const GENERATED_SCHEMA_FILE_NAME = 'schema.ts'

/** 生成物内容：指向对应方言手写 schema 的重导出。 */
export function schemaStubContent(provider: DatabaseProvider): string {
  const moduleName = schemaFileOf(provider).replace(/\.ts$/, '')
  return `export * from './${moduleName}'\n`
}

/** 计算这次 setup 要做什么。 */
export function planSchemaSetup(input: SchemaSetupInput): SchemaSetupPlan {
  const targetContent = schemaStubContent(input.provider)
  return {
    provider: input.provider,
    dialect: dialectOf(input.provider),
    migrationDir: input.provider === 'postgres' ? 'postgres' : 'sqlite',
    sourceFileName: schemaFileOf(input.provider),
    targetFileName: GENERATED_SCHEMA_FILE_NAME,
    targetContent,
    needsWrite: input.targetContent !== targetContent,
  }
}
