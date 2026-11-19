import { describe, expect, it } from 'vitest'
import { SETTING_FIELDS, SETTING_TABS, settingTab } from '../../src/core/config/registry'

/**
 * 配置注册表的分类形状。
 *
 * 后台设置页按 `tab → group → field` 渲染，tab 是业务域而不是「全局模块 / 能力」：
 * 服务模块开关跟随所属业务域，能力开关（`features.*`）与认证总闸（`modules.auth`）
 * 已移除。
 */
describe('SETTING_TABS', () => {
  it('按业务域分为 9 个 tab', () => {
    expect(SETTING_TABS.map((tab) => tab.id)).toEqual([
      'general',
      'users',
      'content',
      'auth',
      'payment',
      'mail',
      'analytics',
      'notification',
      'custom',
    ])
  })

  it('settingTab 按 id 解析 tab，未知 id 返回 undefined', () => {
    expect(settingTab('payment')?.id).toBe('payment')
    expect(settingTab('nope')).toBeUndefined()
  })

  it('auth tab 的 authMethods 分组包含三种登录方法与邮箱验证', () => {
    const authTab = settingTab('auth')
    const group = authTab?.groups.find((item) => item.id === 'authMethods')
    expect(group).toBeDefined()
    expect(group?.fields.map((field) => field.key)).toEqual([
      'auth.emailEnabled',
      'auth.googleEnabled',
      'auth.githubEnabled',
      'auth.requireEmailVerification',
    ])
  })
})

describe('SETTING_FIELDS', () => {
  it('不再包含 features.* 能力开关', () => {
    expect(SETTING_FIELDS.some((field) => field.key.startsWith('features.'))).toBe(false)
  })

  it('不再包含 modules.auth 总开关', () => {
    expect(SETTING_FIELDS.some((field) => field.key === 'modules.auth')).toBe(false)
  })

  it('包含用户中心功能开关、默认角色与注册赠积分', () => {
    expect(SETTING_FIELDS.map((field) => field.key)).toEqual(
      expect.arrayContaining(['userFeatures.apiKeys', 'users.defaultRole', 'signupCredits.amount']),
    )
  })

  it('包含三种认证方法开关', () => {
    expect(SETTING_FIELDS.map((field) => field.key)).toEqual(
      expect.arrayContaining(['auth.emailEnabled', 'auth.googleEnabled', 'auth.githubEnabled']),
    )
  })
})
