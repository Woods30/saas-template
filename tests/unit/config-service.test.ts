import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseConfig, getResolvedConfig, setResolvedConfig } from '../../src/config/website'
import {
  getSettingsSnapshot,
  getSettingsVersion,
  loadSettings,
  resetSettingsCache,
  saveSettings,
  settingsCacheFresh,
} from '../../src/core/config/service'

/**
 * 配置服务：读库 → 合并 → 装进全局；后台写完立即生效。
 *
 * 这里用一个假 db 记录读写，不连真库：服务关心的是「读什么、合并什么、
 * 什么时候刷新」，不是 SQL。
 */

type Row = { key: string; value: string; updatedAt: Date }

function fakeDb(rows: Row[] = []) {
  const state = { rows: [...rows] }
  return {
    state,
    db: {
      select: () => ({
        from: () => Promise.resolve(state.rows.map((row) => ({ ...row }))),
      }),
      insert: () => ({
        values: (value: Row) => ({
          onConflictDoUpdate: ({ set }: { set: Row }) => {
            const index = state.rows.findIndex((row) => row.key === value.key)
            if (index >= 0) {
              state.rows[index] = { ...state.rows[index], ...set }
            } else {
              state.rows.push(value)
            }
            return Promise.resolve()
          },
        }),
      }),
    } as never,
  }
}

describe('配置服务', () => {
  beforeEach(() => {
    setResolvedConfig(baseConfig)
    resetSettingsCache()
  })

  it('库里没有分组时用出厂配置', async () => {
    const { db } = fakeDb()
    await loadSettings(db, 1_000)
    expect(getSettingsSnapshot().brand.name).toBe(baseConfig.metadata.name)
    expect(getResolvedConfig().metadata.name).toBe(baseConfig.metadata.name)
  })

  it('读到库里的分组并装进全局配置', async () => {
    const { db } = fakeDb([
      {
        key: 'brand',
        value: JSON.stringify({ name: 'Acme', logoAccent: 'e', tagline: '' }),
        updatedAt: new Date(),
      },
    ])
    await loadSettings(db, 1_000)
    expect(getSettingsSnapshot().brand.name).toBe('Acme')
    expect(getResolvedConfig().metadata.name).toBe('Acme')
  })

  it('坏 JSON 只丢那一组，其余照常', async () => {
    const { db } = fakeDb([
      { key: 'brand', value: '{不是 json', updatedAt: new Date() },
      {
        key: 'payment',
        value: JSON.stringify({ enabled: true, provider: 'creem' }),
        updatedAt: new Date(),
      },
    ])
    await loadSettings(db, 1_000)
    expect(getSettingsSnapshot().brand.name).toBe(baseConfig.metadata.name)
    expect(getSettingsSnapshot().payment.provider).toBe('creem')
  })

  it('TTL 内不重复读库', async () => {
    const select = vi.fn(() => ({
      from: () => Promise.resolve([]),
    }))
    const countingDb = { select } as never
    await loadSettings(countingDb, 1_000)
    expect(select).toHaveBeenCalledTimes(1)
    await loadSettings(countingDb, 1_000 + 29_000)
    expect(select).toHaveBeenCalledTimes(1)
    await loadSettings(countingDb, 1_000 + 31_000)
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('读库失败时退回出厂配置而不是抛错', async () => {
    const failing = {
      select: () => ({
        from: () => Promise.reject(new Error('no such table: settings')),
      }),
    } as never
    await expect(loadSettings(failing, 1_000)).resolves.toBeDefined()
    expect(getResolvedConfig().metadata.name).toBe(baseConfig.metadata.name)
  })

  it('保存后立即生效并提升版本号', async () => {
    const { db, state } = fakeDb()
    await loadSettings(db, 1_000)
    const before = getSettingsVersion()

    await saveSettings(db, 'brand', { name: 'Acme', logoAccent: 'e', tagline: '标语' })

    expect(state.rows).toHaveLength(1)
    expect(JSON.parse(state.rows[0]?.value ?? '{}').name).toBe('Acme')
    expect(getResolvedConfig().metadata.name).toBe('Acme')
    expect(getSettingsVersion()).toBe(before + 1)
  })

  it('库里的分组被删掉后回落到出厂值，不留上一次的值', async () => {
    const { db } = fakeDb([
      {
        key: 'brand',
        value: JSON.stringify({ name: 'Acme', logoAccent: 'e', tagline: '' }),
        updatedAt: new Date(),
      },
    ])
    await loadSettings(db, 1_000)
    expect(getResolvedConfig().metadata.name).toBe('Acme')

    // 分组被删掉（后台清空、迁移丢了）后，下一次刷新必须回到出厂值，
    // 不能把上一轮读到的值当成默认值留下。
    await loadSettings(fakeDb().db, 1_000 + 31_000)
    expect(getResolvedConfig().metadata.name).toBe(baseConfig.metadata.name)
  })

  it('保存非法值直接抛错且不落库', async () => {
    const { db, state } = fakeDb()
    await expect(saveSettings(db, 'brand', { name: 123 })).rejects.toThrow()
    expect(state.rows).toHaveLength(0)
  })

  it('保存只影响该分组，其余分组保持原值', async () => {
    const { db } = fakeDb()
    await loadSettings(db, 1_000)
    await saveSettings(db, 'payment', { enabled: false, provider: 'creem' })
    expect(getSettingsSnapshot().payment.provider).toBe('creem')
    expect(getSettingsSnapshot().brand.name).toBe(baseConfig.metadata.name)
  })

  it('settingsCacheFresh 反映缓存新鲜度', async () => {
    const { db } = fakeDb()
    expect(settingsCacheFresh(1_000)).toBe(false)
    await loadSettings(db, 1_000)
    expect(settingsCacheFresh(1_000)).toBe(true)
    expect(settingsCacheFresh(1_000 + 31_000)).toBe(false)
  })
})
