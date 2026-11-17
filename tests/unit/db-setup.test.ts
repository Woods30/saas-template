import { describe, expect, it } from 'vitest'
import {
  GENERATED_SCHEMA_FILE_NAME,
  planSchemaSetup,
  schemaStubContent,
} from '../../src/core/db/setup'

describe('planSchemaSetup', () => {
  it('postgres 用 pg schema 与 postgres 迁移目录', () => {
    const plan = planSchemaSetup({ provider: 'postgres', targetContent: null })
    expect(plan.sourceFileName).toBe('schema.postgres.ts')
    expect(plan.targetFileName).toBe(GENERATED_SCHEMA_FILE_NAME)
    expect(plan.dialect).toBe('postgresql')
    expect(plan.migrationDir).toBe('postgres')
    expect(plan.targetContent).toBe("export * from './schema.postgres'\n")
    expect(plan.needsWrite).toBe(true)
  })

  it('sqlite 与 d1 共用 sqlite schema', () => {
    for (const provider of ['sqlite', 'd1'] as const) {
      const plan = planSchemaSetup({ provider, targetContent: null })
      expect(plan.sourceFileName).toBe('schema.sqlite.ts')
      expect(plan.dialect).toBe('sqlite')
      expect(plan.migrationDir).toBe('sqlite')
      expect(plan.targetContent).toBe("export * from './schema.sqlite'\n")
    }
  })

  it('内容一致时不重复写文件', () => {
    const plan = planSchemaSetup({
      provider: 'sqlite',
      targetContent: schemaStubContent('sqlite'),
    })
    expect(plan.needsWrite).toBe(false)
  })

  it('切方言时判定为需要写入', () => {
    const plan = planSchemaSetup({
      provider: 'postgres',
      targetContent: schemaStubContent('sqlite'),
    })
    expect(plan.needsWrite).toBe(true)
  })
})
