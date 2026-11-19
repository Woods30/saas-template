import { describe, expect, it } from 'vitest'
import { requireSettingTab } from '../../src/core/config/admin'

/**
 * 后台保存接口的 tab 解析。
 *
 * server function 本体依赖请求上下文（会话、env、DB），单元测试里调用不会走到
 * handler；这里覆盖它用来拒绝非法输入的那段纯逻辑。
 */
describe('saveAdminSettings', () => {
  it('未知 tab 返回 400', () => {
    let thrown: unknown
    try {
      requireSettingTab('nope')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(400)
  })

  it('已知 tab 解析为对应分区', () => {
    expect(requireSettingTab('general').id).toBe('general')
  })
})
