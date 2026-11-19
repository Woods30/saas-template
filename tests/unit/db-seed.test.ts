import { describe, expect, it } from 'vitest'
import {
  applySeedOverrides,
  buildRbacSeedSql,
  buildSeedSql,
  parseSeedOverrides,
  seedValues,
} from '../../scripts/db-seed'
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from '../../src/core/auth/rbac'
import { defaultSettingsValues, SETTING_FIELDS } from '../../src/core/config/registry'
import { createTestDatabase } from '../helpers/database'

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
    const values = defaultSettingsValues()
    const result = applySeedOverrides(values, {
      brandName: 'Acme',
      brandTagline: '标语',
      supportEmail: 'hi@acme.dev',
    })

    expect(result['brand.name']).toBe('Acme')
    expect(result['brand.tagline']).toBe('标语')
    expect(result['mail.supportEmail']).toBe('hi@acme.dev')
    // 没被覆盖的字段保持出厂值
    expect(result['seo.default.title']).toEqual(values['seo.default.title'])
    expect(result['modules.blog']).toBe(values['modules.blog'])
  })

  it('空覆盖等于原样返回', () => {
    const values = defaultSettingsValues()
    expect(applySeedOverrides(values, {})).toEqual(values)
  })
})

describe('env 只作 seed 初值', () => {
  it('从 env 抄入字符串、布尔与列表', () => {
    const values = seedValues(
      {
        BRAND_UNUSED: 'x',
        STRIPE_SECRET_KEY: 'sk_live_1',
        CREEM_DEBUG: 'true',
        ANALYTICS_UNUSED: 'y',
        VITE_GA_ID: 'G-1',
      },
      {},
    )
    expect(values['stripe.secretKey']).toBe('sk_live_1')
    expect(values['creem.debug']).toBe(true)
  })

  it('旧写法的分析标识回退到新键', () => {
    const values = seedValues(
      { VITE_UMAMI_ID: 'umami-legacy', VITE_CLARITY_ID: 'clarity-legacy' },
      {},
    )
    expect(values['analytics.umamiWebsiteId']).toBe('umami-legacy')
    expect(values['analytics.clarityProjectId']).toBe('clarity-legacy')
  })

  it('非法收款账户 JSON 回落空列表，不静默生效半个配置', () => {
    const values = seedValues({ VITE_MANUAL_PAYMENT_ACCOUNTS: 'not-json' }, {})
    expect(values['manualPayments.accounts']).toEqual([])
  })
})

describe('种子 SQL', () => {
  it('默认只补缺失的，不覆盖后台改过的值', () => {
    const sql = buildSeedSql(defaultSettingsValues(), false, 'sqlite')
    expect(sql).toContain('ON CONFLICT (key) DO NOTHING')
    expect(sql).not.toContain('DO UPDATE')
  })

  it('--force 时覆盖已存在的值', () => {
    const sql = buildSeedSql(defaultSettingsValues(), true, 'sqlite')
    expect(sql).toContain('DO UPDATE SET value = EXCLUDED.value')
  })

  it('EXCLUDED 只出现在 DO UPDATE 里，VALUES 里用不合法', () => {
    const sql = buildSeedSql(defaultSettingsValues(), true, 'sqlite')
    const valuesPart = sql.slice(0, sql.indexOf('ON CONFLICT'))
    expect(valuesPart).not.toContain('EXCLUDED')
  })

  it('先清掉注册表之外的旧键（早期整组 JSON），但保留 custom.*', () => {
    const sql = buildSeedSql(defaultSettingsValues(), false, 'sqlite')
    expect(sql.startsWith('DELETE FROM settings WHERE key NOT IN (')).toBe(true)
    expect(sql).toContain("'brand.name'")
    // `custom.*` 由自定义配置 tab 写入，不在注册表里，seed 不能删。
    expect(sql).toContain("AND key NOT LIKE 'custom.%'")
    // 旧键仍会被清：它们不在白名单里，也不匹配 `custom.%`。
    expect(sql).not.toContain("'features.")
    expect(sql).not.toContain("'modules.auth'")
  })

  it('每个字段一条 INSERT', () => {
    const values = defaultSettingsValues()
    const sql = buildSeedSql(values, false, 'sqlite')
    const inserts = sql.match(/INSERT INTO settings/g) ?? []
    expect(inserts).toHaveLength(SETTING_FIELDS.length)
  })

  it('sqlite 方言用秒级时间戳', () => {
    const sql = buildSeedSql(defaultSettingsValues(), false, 'sqlite')
    expect(sql).toContain("strftime('%s','now')")
  })

  it('postgres 方言用 now()，不能用 sqlite 的 strftime', () => {
    const sql = buildSeedSql(defaultSettingsValues(), false, 'postgresql')
    expect(sql).toContain('now()')
    expect(sql).not.toContain('strftime')
  })

  it('单引号被转义，不会截断 SQL', () => {
    const values = defaultSettingsValues()
    values['brand.name'] = "O'Brien"
    const sql = buildSeedSql(values, false, 'sqlite')
    expect(sql).toContain("O''Brien")
    expect(sql).not.toContain("'O'Brien'")
  })
})

describe('种子在真实 schema 上跑通', () => {
  it('配置与 RBAC 幂等落库，重复播种不插重复行', () => {
    const { sqlite } = createTestDatabase()
    sqlite.exec(buildSeedSql(defaultSettingsValues(), false, 'sqlite'))
    sqlite.exec(buildSeedSql(defaultSettingsValues(), false, 'sqlite'))

    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get()).toMatchObject({
      n: SETTING_FIELDS.length,
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
    sqlite.close()
  })
})
