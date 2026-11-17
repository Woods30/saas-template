import { describe, expect, it } from 'vitest'
import {
  applyResourceBindings,
  type CommandRunner,
  provisionResources,
} from '../../scripts/lib/setup-resources'

/**
 * setup 脚本对 Cloudflare 资源的处理。
 *
 * 三条硬约束：
 * 1. **不碰 R2**。R2 必须先在 Cloudflare Dashboard 开通一次（免费额度内不收费，
 *    但需绑支付方式），API 代劳不了（`wrangler r2 bucket list` 返回 code 10042）。
 *    脚本擅自创建会把「未开通」这个事实藏起来，等到文件上传真要跑时才炸。
 * 2. **不抹注释**。`wrangler.jsonc` 里的注释解释了资源 ID 是账号相关的、
 *    R2 为什么被注释掉；整体回写会把这些运维前提一并清空。
 * 3. **不拼 shell**。资源名会进到命令行里，必须走 argv 数组而不是拼成字符串
 *    交给 shell —— 拼字符串等于留一个命令注入的口子。
 */

/** 假的命令执行器：记录 argv，按需返回 stdout 或抛错。 */
function fakeRunner(handlers: {
  d1Create?: string | Error
  d1List?: string
  kvCreate?: string | Error
  kvList?: string
}): { run: CommandRunner; commands: string[][] } {
  const commands: string[][] = []
  const run: CommandRunner = (command, args) => {
    commands.push([command, ...args])
    const line = args.join(' ')
    if (line.includes('d1 create')) {
      const result = handlers.d1Create ?? JSON.stringify({ uuid: 'db-uuid' })
      if (result instanceof Error) throw result
      return result
    }
    if (line.includes('d1 list')) return handlers.d1List ?? '[]'
    if (line.includes('kv namespace create')) {
      const result = handlers.kvCreate ?? 'id = "abc123def456"'
      if (result instanceof Error) throw result
      return result
    }
    if (line.includes('kv namespace list')) return handlers.kvList ?? '[]'
    return ''
  }
  return { run, commands }
}

describe('provisionResources', () => {
  it('只创建 D1 与 KV，不创建 R2 bucket', () => {
    const { run, commands } = fakeRunner({})

    const resources = provisionResources('acme', run)

    expect(resources.dbName).toBe('acme-db')
    expect(resources.kvName).toBe('acme-cache')
    expect(commands.some((argv) => argv.join(' ').includes('r2'))).toBe(false)
  })

  it('命令以 argv 数组下发，不拼成 shell 字符串', () => {
    const { run, commands } = fakeRunner({})

    provisionResources('acme', run)

    expect(commands[0]).toEqual(['wrangler', 'd1', 'create', 'acme-db', '--json'])
  })

  it('项目名非法时抛错，不把它带进命令行', () => {
    const { run, commands } = fakeRunner({})

    // 名字会进到 wrangler 的参数里，含 shell 元字符的一律拒绝。
    expect(() => provisionResources('acme; rm -rf /', run)).toThrow(/项目名/)
    expect(commands).toHaveLength(0)
  })

  it('项目名为空或含大写、斜杠时抛错', () => {
    const { run } = fakeRunner({})

    expect(() => provisionResources('', run)).toThrow(/项目名/)
    expect(() => provisionResources('Acme', run)).toThrow(/项目名/)
    expect(() => provisionResources('acme/db', run)).toThrow(/项目名/)
  })

  it('解析新创建的 D1 与 KV 的 ID', () => {
    const { run } = fakeRunner({})

    const resources = provisionResources('acme', run)

    expect(resources.dbId).toBe('db-uuid')
    expect(resources.kvId).toBe('abc123def456')
  })

  it('资源已存在时从列表里找回 ID', () => {
    const { run, commands } = fakeRunner({
      d1Create: new Error('已存在'),
      d1List: JSON.stringify([{ uuid: 'existing-db', name: 'acme-db' }]),
      kvCreate: new Error('已存在'),
      kvList: JSON.stringify([{ id: 'existing-kv', title: 'acme-cache' }]),
    })

    const resources = provisionResources('acme', run)

    expect(resources.dbId).toBe('existing-db')
    expect(resources.kvId).toBe('existing-kv')
    expect(commands.some((argv) => argv.join(' ').includes('d1 list'))).toBe(true)
    expect(commands.some((argv) => argv.join(' ').includes('kv namespace list'))).toBe(true)
  })

  it('既建不出来也列不出来时抛错，而不是留下空 ID', () => {
    const { run } = fakeRunner({
      d1Create: new Error('创建失败'),
      d1List: '[]',
      kvCreate: new Error('创建失败'),
      kvList: '[]',
    })

    expect(() => provisionResources('acme', run)).toThrow(/D1/)
  })
})

const WRANGLER = `{
  "name": "jerbix",
  // ID 由 \`wrangler d1 create\` 产出后手工回填——\`--update-config\` 会抹掉本文件注释。
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "saas-template-db",
      "database_id": "old-db-id",
      "migrations_dir": "./src/core/db/migrations"
    }
  ],
  // R2 暂未启用：必须先在 Dashboard 开通一次。
  // "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "saas-template-uploads" }],
  "kv_namespaces": [{ "binding": "CACHE", "id": "old-kv-id" }]
}
`

describe('applyResourceBindings', () => {
  it('写入 D1 与 KV 的资源标识', () => {
    const result = applyResourceBindings(WRANGLER, {
      dbName: 'acme-db',
      dbId: 'new-db-id',
      kvId: 'new-kv-id',
    })

    expect(result).toContain('"database_name": "acme-db"')
    expect(result).toContain('"database_id": "new-db-id"')
    expect(result).toContain('"id": "new-kv-id"')
    expect(result).not.toContain('old-db-id')
    expect(result).not.toContain('old-kv-id')
  })

  it('保留注释与其它字段', () => {
    const result = applyResourceBindings(WRANGLER, {
      dbName: 'acme-db',
      dbId: 'new-db-id',
      kvId: 'new-kv-id',
    })

    expect(result).toContain('// ID 由 `wrangler d1 create` 产出后手工回填')
    expect(result).toContain('// R2 暂未启用')
    expect(result).toContain('"name": "jerbix"')
    expect(result).toContain('"migrations_dir": "./src/core/db/migrations"')
  })

  it('不启用 R2：注释掉的 r2_buckets 保持注释状态', () => {
    const result = applyResourceBindings(WRANGLER, {
      dbName: 'acme-db',
      dbId: 'new-db-id',
      kvId: 'new-kv-id',
    })

    expect(result).toContain('// "r2_buckets"')
    expect(result).not.toMatch(/^\s*"r2_buckets"/m)
  })

  it('目标路径不存在时报错，避免静默产出半成品配置', () => {
    const withoutKv = '{\n  "name": "jerbix"\n}\n'

    expect(() =>
      applyResourceBindings(withoutKv, {
        dbName: 'acme-db',
        dbId: 'new-db-id',
        kvId: 'new-kv-id',
      }),
    ).toThrow(/路径不存在/)
  })
})
