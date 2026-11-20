import { describe, expect, it } from 'vitest'
import { getJsoncValue, setJsoncValue } from '../../scripts/lib/jsonc-edit'

/**
 * JSONC 的定点改写契约。
 *
 * `wrangler.jsonc` 里存着「为什么 R2 被注释掉」「资源 ID 是账号相关的、换账号必须重新
 * 绑定」这类运维说明。用 `JSON.parse` → `JSON.stringify` 回写会把它们全部抹掉，
 * 因此改写必须是**只替换目标值的那一段字节**，其余原样保留。
 */

const SAMPLE = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  // Worker 名决定线上地址：\`<name>.<账号 workers.dev 子域>.workers.dev\`。
  "name": "saas-template",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  /* 自定义 server entry：注入语言上下文与 CSP nonce。 */
  "main": "src/server.ts",
  "vars": {
    "NODE_ENV": "production",
    "PORT": 3000
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "saas-template-db",
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "./src/core/db/migrations"
    }
  ],
  "kv_namespaces": [{ "binding": "CACHE", "id": "00000000000000000000000000000000" }]
}
`

describe('getJsoncValue', () => {
  it('读取顶层与嵌套的值', () => {
    expect(getJsoncValue(SAMPLE, ['name'])).toBe('saas-template')
    expect(getJsoncValue(SAMPLE, ['vars', 'NODE_ENV'])).toBe('production')
    expect(getJsoncValue(SAMPLE, ['d1_databases', 0, 'database_name'])).toBe('saas-template-db')
  })

  it('路径不存在返回 undefined', () => {
    expect(getJsoncValue(SAMPLE, ['nope'])).toBeUndefined()
    expect(getJsoncValue(SAMPLE, ['d1_databases', 0, 'nope'])).toBeUndefined()
    expect(getJsoncValue(SAMPLE, ['vars', 'NOPE', 'deep'])).toBeUndefined()
  })

  it('读出数组与对象原值', () => {
    expect(getJsoncValue(SAMPLE, ['compatibility_flags'])).toEqual(['nodejs_compat'])
  })
})

describe('setJsoncValue', () => {
  it('替换字符串值且保留全部注释', () => {
    const result = setJsoncValue(SAMPLE, ['name'], 'acme')

    expect(result).toContain('"name": "acme"')
    expect(result).toContain('// Worker 名决定线上地址')
    expect(result).toContain('/* 自定义 server entry：注入语言上下文与 CSP nonce。 */')
    expect(result).toContain('"migrations_dir": "./src/core/db/migrations"')
  })

  it('替换嵌套值', () => {
    const result = setJsoncValue(SAMPLE, ['vars', 'NODE_ENV'], 'development')

    expect(result).toContain('"NODE_ENV": "development"')
    expect(result).toContain('"main": "src/server.ts"')
  })

  it('替换数组元素', () => {
    const result = setJsoncValue(SAMPLE, ['d1_databases', 0, 'database_id'], 'placeholder-id')

    expect(result).toContain('"database_id": "placeholder-id"')
    expect(result).toContain('"database_name": "saas-template-db"')
    expect(result).not.toContain('00000000-0000-0000-0000-000000000000')
  })

  it('路径不存在时抛错，不静默改动文件', () => {
    expect(() => setJsoncValue(SAMPLE, ['nope'], 'x')).toThrow()
    expect(() => setJsoncValue(SAMPLE, ['d1_databases', 0, 'nope'], 'x')).toThrow()
  })

  it('可替换非字符串值', () => {
    const result = setJsoncValue(SAMPLE, ['vars', 'PORT'], 8080)

    expect(result).toContain('"PORT": 8080')
    expect(result).toContain('"NODE_ENV": "production"')
  })

  it('连续改写互不影响', () => {
    const once = setJsoncValue(SAMPLE, ['name'], 'acme')
    const twice = setJsoncValue(once, ['vars', 'NODE_ENV'], 'development')

    expect(twice).toContain('"name": "acme"')
    expect(twice).toContain('"NODE_ENV": "development"')
    expect(twice).toContain('// Worker 名决定线上地址')
  })

  it('改写是幂等的：同样的输入得到同样的输出', () => {
    expect(setJsoncValue(SAMPLE, ['name'], 'acme')).toBe(setJsoncValue(SAMPLE, ['name'], 'acme'))
  })

  it('保留原有的换行与缩进风格', () => {
    const result = setJsoncValue(SAMPLE, ['name'], 'acme')

    expect(result.split('\n')[0]).toBe('{')
    expect(result).toContain('\n  "name": "acme",')
    expect(result.endsWith('\n}\n')).toBe(true)
  })

  it('整体替换数组时按所在行缩进排版', () => {
    const result = setJsoncValue(
      SAMPLE,
      ['d1_databases'],
      [{ binding: 'DB', database_name: 'acme-db', database_id: 'new-id' }],
    )

    // 数组值写在行中间，序列化后的后续行要补上缩进才不会跑到左边。
    expect(result).toContain('"d1_databases": [\n    {\n      "binding": "DB"')
    expect(result).toContain('\n    }\n  ],')
  })
})
