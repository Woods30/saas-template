import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyPlan } from '../../scripts/init/apply'
import {
  buildPlan,
  clearDocsSiteUrl,
  type InitConfig,
  replaceConfigLiteral,
} from '../../scripts/init/plan'

/**
 * init 的「计划 / 执行」分离。
 *
 * `buildPlan` 是纯函数：同一份配置永远产出同一份变更清单，因此可以在单测里断言
 * 「改了哪些文件、改成什么」。`applyPlan` 只负责把清单落到磁盘。
 *
 * 之所以要这样拆：真正容易出错的地方（品牌替换漏了、JSONC 注释被抹掉、重跑一次
 * 把值改坏）全在计划里，把它们放进纯函数才能用单测守住。
 */

const CONFIG: InitConfig = {
  name: 'Acme',
  slug: 'acme',
  domain: 'acme.dev',
  email: 'hello@acme.dev',
  modules: [],
}

// 直接用真实配置文件：配置项改名时这里会立刻红，而不是等到跑 init 才发现。
const WEBSITE = readFileSync(new URL('../../src/config/website.ts', import.meta.url), 'utf-8')
const PRODUCTS = readFileSync(new URL('../../src/config/products.ts', import.meta.url), 'utf-8')

const WRANGLER = `{
  // Worker 名决定线上地址。
  "name": "saas-template",
  "compatibility_date": "2026-10-01",
  // 自定义域名。
  "routes": [{ "pattern": "www.example.com", "custom_domain": true }],
  // ID 由 \`wrangler d1 create\` 产出后手工回填。
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

const PACKAGE_JSON = `{
  "name": "saas-template",
  "version": "0.8.1",
  "private": true
}
`

/** 内存里的仓库：路径 → 内容。 */
function memoryRepo(files: Record<string, string>) {
  const store = new Map(Object.entries(files))
  return {
    read: (path: string) => store.get(path) ?? '',
    write: (path: string, content: string) => void store.set(path, content),
    get: (path: string) => store.get(path),
  }
}

const REPO: Record<string, string> = {
  'package.json': PACKAGE_JSON,
  'wrangler.jsonc': WRANGLER,
  'src/config/website.ts': WEBSITE,
  'src/config/products.ts': PRODUCTS,
  'messages/zh.json': readFileSync(new URL('../../messages/zh.json', import.meta.url), 'utf-8'),
  'messages/en.json': readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf-8'),
  'public/manifest.json': readFileSync(
    new URL('../../public/manifest.json', import.meta.url),
    'utf-8',
  ),
}

describe('replaceConfigLiteral', () => {
  it("替换唯一一处 `key: 'value'`", () => {
    expect(replaceConfigLiteral(WEBSITE, 'name', 'Acme')).toContain("name: 'Acme',")
  })

  it('已经是目标值时原样返回', () => {
    const once = replaceConfigLiteral(WEBSITE, 'name', 'Acme')

    expect(replaceConfigLiteral(once, 'name', 'Acme')).toBe(once)
  })

  it('匹配不到时抛错，避免静默什么都没改', () => {
    expect(() => replaceConfigLiteral(WEBSITE, 'nope', 'x')).toThrow(/nope/)
  })

  it('匹配到多处时抛错，避免改错地方', () => {
    const twice = `${WEBSITE}\nconst other = { name: 'Another' }\n`

    expect(() => replaceConfigLiteral(twice, 'name', 'Acme')).toThrow(/2 处/)
  })

  it('新值含单引号时抛错，而不是产出语法错误的 TypeScript', () => {
    expect(() => replaceConfigLiteral(WEBSITE, 'name', "O'Brien")).toThrow(/引号/)
  })

  it('能改同一行内的属性（supportEmail）', () => {
    expect(replaceConfigLiteral(WEBSITE, 'supportEmail', 'hello@acme.dev')).toContain(
      "supportEmail: 'hello@acme.dev'",
    )
  })
})

describe('buildPlan', () => {
  const plan = buildPlan(CONFIG)

  it('计划覆盖包名、两种语言的文案、manifest、站点配置与部署配置', () => {
    expect(plan.files.map((file) => file.path)).toEqual([
      'package.json',
      'messages/zh.json',
      'messages/en.json',
      'public/manifest.json',
      'src/config/website.ts',
      'src/config/products.ts',
      'wrangler.jsonc',
    ])
  })

  it('每个变更都带一句说明，供 --dry-run 展示', () => {
    for (const file of plan.files) expect(file.description.length).toBeGreaterThan(0)
  })

  it('package.json 的 name 改成 slug', () => {
    const file = plan.files.find((entry) => entry.path === 'package.json')

    expect(JSON.parse(file?.transform(PACKAGE_JSON) ?? '{}').name).toBe('acme')
  })

  it('站点名、字标强调段与支持邮箱一起改', () => {
    const file = plan.files.find((entry) => entry.path === 'src/config/website.ts')
    const result = file?.transform(WEBSITE) ?? ''

    expect(result).toContain("name: 'Acme',")
    // 强调段是 Jerbix 的品牌装置，新项目默认没有。
    expect(result).toContain("logoAccent: '',")
    expect(result).toContain("supportEmail: 'hello@acme.dev'")
  })

  it('一次性商品的显示名改成新品牌', () => {
    const file = plan.files.find((entry) => entry.path === 'src/config/products.ts')
    const result = file?.transform(PRODUCTS) ?? ''

    expect(result).toContain("name: 'Acme',")
    // 价格引用不在 init 范围内：lookup_key 取决于使用者在 Stripe 里建了什么。
    // 断言「原样透传」而不是写死某个 lookup_key，各仓的价格引用不同。
    const priceReference = /prices: \{ once: '([^']+)' \}/.exec(PRODUCTS)?.[1]
    expect(priceReference).toBeTruthy()
    expect(result).toContain(`prices: { once: '${priceReference}' }`)
  })

  it('wrangler.jsonc 改 Worker 名、域名与资源名，ID 置为占位符', () => {
    const file = plan.files.find((entry) => entry.path === 'wrangler.jsonc')
    const result = file?.transform(WRANGLER) ?? ''

    expect(result).toContain('"name": "acme"')
    expect(result).toContain('"pattern": "acme.dev"')
    expect(result).toContain('"database_name": "acme-db"')
    // 资源 ID 是账号相关的，init 不可能知道，留占位符交给部署流程回填。
    expect(result).not.toContain('00000000-0000-0000-0000-000000000000')
    expect(result).not.toContain('00000000000000000000000000000000')
    expect(result).toContain('REPLACE_ME')
  })

  it('wrangler.jsonc 的注释原样保留', () => {
    const file = plan.files.find((entry) => entry.path === 'wrangler.jsonc')
    const result = file?.transform(WRANGLER) ?? ''

    expect(result).toContain('// Worker 名决定线上地址。')
    expect(result).toContain('// ID 由 `wrangler d1 create` 产出后手工回填。')
    expect(result).toContain('"migrations_dir": "./src/core/db/migrations"')
  })
})

describe('applyPlan', () => {
  it('只写入内容真的变了的文件', () => {
    const repo = memoryRepo(REPO)
    const plan = buildPlan(CONFIG)
    const result = applyPlan(plan, repo)

    // 期望值由计划本身算出，而不是写死一份清单：仓库可能已经被 `pnpm run init`
    // 改写过（品牌换成使用者自己的、模块全关），那时所有变换都成了空操作，
    // 写死的清单就与现实脱节了。这里断言的正是 applyPlan 的职责：
    // 内容真的变了的文件才写，没变的一个都不写。
    const changed = plan.files
      .filter((file) => {
        const current = REPO[file.path] ?? ''
        return file.transform(current) !== current
      })
      .map((file) => file.path)
      .sort()

    expect(result.written.sort()).toEqual(changed)
    expect(repo.get('package.json')).toContain('"name": "acme"')
  })

  it('幂等：同一份配置跑第二次不再改动任何文件', () => {
    const repo = memoryRepo(REPO)
    applyPlan(buildPlan(CONFIG), repo)

    const second = applyPlan(buildPlan(CONFIG), repo)

    expect(second.written).toEqual([])
    expect(second.unchanged.sort()).toEqual([
      'messages/en.json',
      'messages/zh.json',
      'package.json',
      'public/manifest.json',
      'src/config/products.ts',
      'src/config/website.ts',
      'wrangler.jsonc',
    ])
  })

  it('计划里同一文件出现两次时抛错', () => {
    // 后一项会基于原始内容重算，把前一项的结果覆盖掉。
    const duplicated = {
      files: [
        { path: 'a.ts', description: 'x', transform: (s: string) => `${s}1` },
        { path: 'a.ts', description: 'y', transform: (s: string) => `${s}2` },
      ],
    }

    expect(() => applyPlan(duplicated, memoryRepo({ 'a.ts': 'x' }))).toThrow(/重复/)
  })

  it('文件缺失时抛错，且不会留下改了一半的文件', () => {
    const repo = memoryRepo({
      'package.json': PACKAGE_JSON,
      'messages/zh.json': '{}',
      'messages/en.json': '{}',
      'public/manifest.json': '{}',
      'src/config/website.ts': WEBSITE,
      'src/config/products.ts': PRODUCTS,
    })

    expect(() => applyPlan(buildPlan(CONFIG), repo)).toThrow(/wrangler\.jsonc/)
    // 前面两个文件虽然算得出结果，但不能已经落盘。
    expect(repo.get('package.json')).toBe(PACKAGE_JSON)
  })
})

describe('真实仓库文件', () => {
  it('init 能改到真实 wrangler.jsonc 里的每个目标路径', () => {
    // JSONC 定点改写只改已有位置，路径不存在就抛错。仓库里的 wrangler.jsonc
    // 少了任何一个目标键（有人把 routes 注释掉就会发生），init 会在半路失败。
    const real = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf-8')
    const step = buildPlan(CONFIG).files.find((file) => file.path === 'wrangler.jsonc')
    if (!step) throw new Error('计划里没有 wrangler.jsonc')
    expect(() => step.transform(real)).not.toThrow()
  })
})

describe('clearDocsSiteUrl', () => {
  it('清掉 docs 配置里的外部文档站地址', () => {
    const source = "    docs: { enabled: false, siteUrl: 'https://docs.example.com/docs' },"
    expect(clearDocsSiteUrl(source)).toBe('    docs: { enabled: false },')
  })

  it('类型声明在前面时改的是配置值，不是类型', () => {
    const source = [
      '  docs: {',
      '    enabled: boolean',
      '    siteUrl?: string',
      '  }',
      "  docs: { enabled: false, siteUrl: 'https://docs.example.com/docs' },",
    ].join('\n')
    expect(clearDocsSiteUrl(source)).toContain('docs: { enabled: false },')
    expect(clearDocsSiteUrl(source)).toContain('enabled: boolean')
  })

  it('没有 siteUrl 时原样返回', () => {
    const source = '    docs: { enabled: true },'
    expect(clearDocsSiteUrl(source)).toBe(source)
  })
})
