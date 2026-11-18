import { describe, expect, it } from 'vitest'
import {
  applySeedOverrides,
  buildCatalogSql,
  buildRbacSeedSql,
  buildSeedSql,
  parseSeedOverrides,
} from '../../scripts/db-seed'
import { findProduct } from '../../src/config/products'
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from '../../src/core/auth/rbac'
import { defaultSettings } from '../../src/core/config/settings'
import { DEFAULT_ENTITLEMENTS, DEFAULT_PLANS } from '../../src/modules/entitlements/catalog'
import { resolveEntitlements } from '../../src/modules/entitlements/service'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 种子脚本：把出厂配置写进数据库。
 *
 * 关注三件事：覆盖项怎么解析、覆盖怎么落到配置上、生成的 SQL 对不对得上。
 */

describe('种子覆盖项解析', () => {
  it('识别 --brand / --tagline / --email', () => {
    expect(parseSeedOverrides(['--brand', 'Acme', '--email', 'hi@acme.dev'])).toEqual({
      brandName: 'Acme',
      brandTagline: undefined,
      supportEmail: 'hi@acme.dev',
    })
  })

  it('没传就是空覆盖', () => {
    expect(parseSeedOverrides([])).toEqual({
      brandName: undefined,
      brandTagline: undefined,
      supportEmail: undefined,
    })
  })

  it('缺少取值直接报错', () => {
    expect(() => parseSeedOverrides(['--brand'])).toThrow()
  })
})

describe('覆盖落到配置上', () => {
  it('改品牌名与支持邮箱，其余不动', () => {
    const settings = defaultSettings()
    const result = applySeedOverrides(settings, {
      brandName: 'Acme',
      brandTagline: '标语',
      supportEmail: 'hi@acme.dev',
    })

    expect(result.brand.name).toBe('Acme')
    expect(result.brand.tagline).toBe('标语')
    expect(result.mail.supportEmail).toBe('hi@acme.dev')
    // 没被覆盖的字段保持出厂值
    expect(result.seo).toEqual(settings.seo)
    expect(result.modules).toEqual(settings.modules)
  })

  it('空覆盖等于原样返回', () => {
    const settings = defaultSettings()
    expect(applySeedOverrides(settings, {})).toEqual(settings)
  })
})

describe('种子 SQL', () => {
  it('默认只补缺失的，不覆盖后台改过的值', () => {
    const sql = buildSeedSql(defaultSettings(), false, 'sqlite')
    expect(sql).toContain('ON CONFLICT (key) DO NOTHING')
    expect(sql).not.toContain('DO UPDATE')
  })

  it('--force 时覆盖已存在的值', () => {
    const sql = buildSeedSql(defaultSettings(), true, 'sqlite')
    expect(sql).toContain('DO UPDATE SET value = EXCLUDED.value')
  })

  it('EXCLUDED 只出现在 DO UPDATE 里，VALUES 里用不合法', () => {
    const sql = buildSeedSql(defaultSettings(), true, 'sqlite')
    const valuesPart = sql.slice(0, sql.indexOf('ON CONFLICT'))
    expect(valuesPart).not.toContain('EXCLUDED')
  })

  it('每个分组一条 INSERT', () => {
    const sql = buildSeedSql(defaultSettings(), false, 'sqlite')
    expect(sql.trim().split('\n')).toHaveLength(6)
    expect(sql).toContain("'brand'")
    expect(sql).toContain("'modules'")
  })

  it('sqlite 方言用秒级时间戳', () => {
    const sql = buildSeedSql(defaultSettings(), false, 'sqlite')
    expect(sql).toContain("strftime('%s','now')")
  })

  it('postgres 方言用 now()，不能用 sqlite 的 strftime', () => {
    const sql = buildSeedSql(defaultSettings(), false, 'postgresql')
    expect(sql).toContain('now()')
    expect(sql).not.toContain('strftime')
  })

  it('单引号被转义，不会截断 SQL', () => {
    const settings = defaultSettings()
    settings.brand.name = "O'Brien"
    const sql = buildSeedSql(settings, false, 'sqlite')
    // JSON 里的单引号在 SQL 字符串字面量中要写成两个
    expect(sql).toContain("O''Brien")
    expect(sql).not.toContain("'O'Brien'")
  })
})

describe('权益目录与套餐的种子 SQL', () => {
  it('目录里的每一项都有 INSERT', () => {
    const sql = buildCatalogSql(false, 'sqlite')
    for (const item of DEFAULT_ENTITLEMENTS) {
      expect(sql).toContain(`'${item.key}'`)
      expect(sql).toContain(`INSERT INTO entitlements (key, name, type, default_limit`)
    }
    expect(sql).toContain(`INSERT INTO plans (key, name, description, product_id`)
    expect(sql).toContain(`INSERT INTO plan_entitlements (id, plan_key, entitlement_key`)
  })

  it('套餐权益的数量对得上，且外键都指向目录里的项', () => {
    const sql = buildCatalogSql(false, 'sqlite')
    const expectedRows = DEFAULT_PLANS.reduce((sum, plan) => sum + plan.entitlements.length, 0)
    expect(sql.match(/INSERT INTO plan_entitlements/g)).toHaveLength(expectedRows)

    const catalogKeys = new Set(DEFAULT_ENTITLEMENTS.map((item) => item.key))
    for (const plan of DEFAULT_PLANS) {
      for (const grant of plan.entitlements) {
        expect(catalogKeys.has(grant.entitlementKey)).toBe(true)
      }
    }
  })

  it('默认只补缺失的；--force 才覆盖后台改过的值', () => {
    const plain = buildCatalogSql(false, 'sqlite')
    expect(plain).toContain('ON CONFLICT (key) DO NOTHING')
    expect(plain).not.toContain('DO UPDATE')

    const forced = buildCatalogSql(true, 'sqlite')
    expect(forced).toContain('DO UPDATE SET name = EXCLUDED.name')
    expect(forced).toContain('ON CONFLICT (plan_key, entitlement_key) DO UPDATE SET')
  })

  it('方言差异：sqlite 用秒级时间戳，pg 用 now()', () => {
    expect(buildCatalogSql(false, 'sqlite')).toContain("strftime('%s','now')")
    const pg = buildCatalogSql(false, 'postgresql')
    expect(pg).toContain('now()')
    expect(pg).not.toContain('strftime')
  })

  it('布尔值用 TRUE / FALSE：PG 的 boolean 列不吃 1/0', () => {
    const sql = buildCatalogSql(false, 'postgresql')
    // 免费版是启用的套餐。
    expect(sql).toContain("'free', '免费版', '基础额度，适合试用', 'free', NULL, TRUE, 10,")
    // 免费版不给 API 调用：enabled 写 FALSE。
    expect(sql).toContain("'pe:free:api_access', 'free', 'api_access', NULL, FALSE)")
    expect(sql).not.toMatch(/, (0|1)\)/)
  })

  it('目录与套餐的 key 唯一', () => {
    expect(new Set(DEFAULT_ENTITLEMENTS.map((item) => item.key)).size).toBe(
      DEFAULT_ENTITLEMENTS.length,
    )
    expect(new Set(DEFAULT_PLANS.map((plan) => plan.key)).size).toBe(DEFAULT_PLANS.length)
  })

  it('套餐指向的商品与付费方式在商品配置里真实存在', () => {
    for (const plan of DEFAULT_PLANS) {
      const product = plan.productId ? findProduct(plan.productId) : undefined
      expect(product, `套餐 ${plan.key} 的商品不存在`).toBeDefined()
      if (!product || !plan.offerId) continue
      // 订阅生效时按 productId + offerId 匹配套餐，对不上就永远授予不了权益。
      expect(
        Object.hasOwn(product.prices, plan.offerId),
        `套餐 ${plan.key} 的付费方式 ${plan.offerId} 不在商品 ${plan.productId} 里`,
      ).toBe(true)
    }
  })

  it('额度型权益的默认额度不是负数', () => {
    for (const item of DEFAULT_ENTITLEMENTS) {
      if (item.type !== 'quota') continue
      expect(item.defaultLimit === null || item.defaultLimit >= 0).toBe(true)
    }
    for (const plan of DEFAULT_PLANS) {
      for (const grant of plan.entitlements) {
        expect(grant.limitValue === null || grant.limitValue >= 0).toBe(true)
      }
    }
  })
})

describe('种子在真实 schema 上跑通', () => {
  it('配置、目录、套餐与套餐权益都落库，重复播种不插重复行', () => {
    const { sqlite } = createTestDatabase()
    sqlite.exec(buildSeedSql(defaultSettings(), false, 'sqlite'))
    sqlite.exec(buildCatalogSql(false, 'sqlite'))

    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get()).toMatchObject({ n: 6 })
    expect(
      sqlite
        .prepare('SELECT key FROM entitlements ORDER BY sort_order')
        .all()
        .map((r) => r.key),
    ).toEqual(DEFAULT_ENTITLEMENTS.map((item) => item.key))
    expect(
      sqlite
        .prepare('SELECT key FROM plans ORDER BY sort_order')
        .all()
        .map((r) => r.key),
    ).toEqual(DEFAULT_PLANS.map((plan) => plan.key))
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM plan_entitlements').get()).toMatchObject({
      n: DEFAULT_PLANS.reduce((sum, plan) => sum + plan.entitlements.length, 0),
    })

    // 再播一次：不覆盖、也不重复。
    sqlite.exec(buildCatalogSql(false, 'sqlite'))
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM plan_entitlements').get()).toMatchObject({
      n: DEFAULT_PLANS.reduce((sum, plan) => sum + plan.entitlements.length, 0),
    })

    // RBAC 权限点与内置角色同样幂等落库。
    sqlite.exec(buildRbacSeedSql(false, 'sqlite'))
    sqlite.exec(buildRbacSeedSql(false, 'sqlite'))
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM permissions').get()).toMatchObject({
      n: DEFAULT_PERMISSIONS.length,
    })
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM roles').get()).toMatchObject({
      n: DEFAULT_ROLES.length,
    })
  })

  it('播种后，订阅生效的用户按套餐拿到权益额度', async () => {
    const { sqlite, db } = createTestDatabase()
    sqlite.exec(buildCatalogSql(false, 'sqlite'))
    seedUser(sqlite, 'u1')
    sqlite
      .prepare(
        `INSERT INTO subscriptions(id,user_id,provider,subscription_id,status,product_id,offer_id,created_at,updated_at)
         VALUES ('s1','u1','stripe','sub_1','active','pro','monthly',1,1)`,
      )
      .run()

    const resolved = await resolveEntitlements(db, 'u1')
    const tasks = resolved.find((item) => item.key === 'ai_tasks')
    const apiAccess = resolved.find((item) => item.key === 'api_access')

    expect(tasks?.limit).toBe(1000)
    expect(apiAccess?.enabled).toBe(true)
    sqlite.close()
  })
})
