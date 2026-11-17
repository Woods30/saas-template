import { describe, expect, it } from 'vitest'
import { assertSchemaMatchesProvider } from '../../src/core/db'
import * as schema from '../../src/core/db/schema'

/**
 * provider 与生成物方言必须一致。
 *
 * 生成物由 `pnpm db:setup` 产出，两边不一致时 SQL 会静默跑错方言——
 * 所以连接建立前就拦下。
 */
describe('assertSchemaMatchesProvider', () => {
  // 显式标注为 `string`：生成物的方言是字面量类型，直接比较会被 TS 判成
  // 「永不相等」而报错——生成物确实是 postgres 时，测试仍要能跑。
  const dialect: string = schema.SCHEMA_DIALECT
  const matching = dialect === 'sqlite' ? 'sqlite' : 'postgres'
  const mismatching = dialect === 'sqlite' ? 'postgres' : 'sqlite'

  it('方言一致时放行', () => {
    expect(() => assertSchemaMatchesProvider(matching)).not.toThrow()
  })

  it('方言不一致时报错并给出修复命令', () => {
    expect(() => assertSchemaMatchesProvider(mismatching)).toThrow(/方言不匹配/)
    expect(() => assertSchemaMatchesProvider(mismatching)).toThrow(/db:setup/)
  })
})
