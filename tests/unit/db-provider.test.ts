import { describe, expect, it } from 'vitest'
import {
  DATABASE_PROVIDERS,
  dialectOf,
  migrationDirOf,
  resolveDatabaseProvider,
  schemaFileOf,
} from '../../src/core/db/provider'

describe('resolveDatabaseProvider', () => {
  it('未设置时默认 sqlite（clone 后开箱即用）', () => {
    expect(resolveDatabaseProvider(undefined)).toBe('sqlite')
    expect(resolveDatabaseProvider(null)).toBe('sqlite')
    expect(resolveDatabaseProvider('')).toBe('sqlite')
    expect(resolveDatabaseProvider('   ')).toBe('sqlite')
  })

  it('大小写与空白不敏感', () => {
    expect(resolveDatabaseProvider('  Postgres ')).toBe('postgres')
    expect(resolveDatabaseProvider('PG')).toBe('postgres')
    expect(resolveDatabaseProvider('PostgreSQL')).toBe('postgres')
    expect(resolveDatabaseProvider('D1')).toBe('d1')
    expect(resolveDatabaseProvider('SQLite3')).toBe('sqlite')
  })

  it('无法识别的值直接抛错，不静默回退', () => {
    expect(() => resolveDatabaseProvider('mysql')).toThrow(/DATABASE_PROVIDER/)
    expect(() => resolveDatabaseProvider('mysql')).toThrow(/sqlite/)
  })

  it('列出的 provider 全部可解析', () => {
    for (const provider of DATABASE_PROVIDERS) {
      expect(resolveDatabaseProvider(provider)).toBe(provider)
    }
  })
})

describe('dialect 映射', () => {
  it('D1 复用 sqlite 方言', () => {
    expect(dialectOf('d1')).toBe('sqlite')
    expect(dialectOf('sqlite')).toBe('sqlite')
    expect(dialectOf('postgres')).toBe('postgresql')
  })

  it('迁移目录按方言分开', () => {
    expect(migrationDirOf('d1')).toBe('sqlite')
    expect(migrationDirOf('sqlite')).toBe('sqlite')
    expect(migrationDirOf('postgres')).toBe('postgres')
  })

  it('schema 文件按方言分开', () => {
    expect(schemaFileOf('sqlite')).toBe('schema.sqlite.ts')
    expect(schemaFileOf('d1')).toBe('schema.sqlite.ts')
    expect(schemaFileOf('postgres')).toBe('schema.postgres.ts')
  })
})
