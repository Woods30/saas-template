import { describe, expect, it } from 'vitest'
import { applySeedOverrides, buildSeedSql, parseSeedOverrides } from '../../scripts/db-seed'
import { defaultSettings } from '../../src/core/config/settings'

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
