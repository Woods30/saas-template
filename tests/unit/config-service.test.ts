import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseConfig, getResolvedConfig, setResolvedConfig } from '../../src/config/website'
import { isEncrypted } from '../../src/core/config/crypto'
import { defaultSettingsValues } from '../../src/core/config/registry'
import {
  getRuntimeServerEnv,
  getSettingsSnapshot,
  getSettingsVersion,
  loadSettings,
  resetSettingsCache,
  saveSettingsGroup,
  settingsCacheFresh,
} from '../../src/core/config/service'

/**
 * 配置服务：读库 → 解密 → 校验 → 装进全局；后台写完立即生效。
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

function storedRow(key: string, value: unknown): Row {
  return { key, value: JSON.stringify(value), updatedAt: new Date() }
}

describe('配置服务', () => {
  beforeEach(() => {
    setResolvedConfig(baseConfig)
    resetSettingsCache()
  })

  it('库里没有配置时用出厂值', async () => {
    const { db } = fakeDb()
    await loadSettings(db, { now: 1_000 })
    expect(getSettingsSnapshot()['brand.name']).toBe(defaultSettingsValues()['brand.name'])
    expect(getResolvedConfig().metadata.name).toBe(baseConfig.metadata.name)
  })

  it('读到库里的字段并装进全局配置', async () => {
    const { db } = fakeDb([storedRow('brand.name', 'Acme')])
    await loadSettings(db, { now: 1_000 })
    expect(getSettingsSnapshot()['brand.name']).toBe('Acme')
    expect(getResolvedConfig().metadata.name).toBe('Acme')
  })

  it('坏 JSON 只丢那个字段，其余照常', async () => {
    const { db } = fakeDb([
      { key: 'brand.name', value: '{不是 json', updatedAt: new Date() },
      storedRow('payment.provider', 'creem'),
    ])
    await loadSettings(db, { now: 1_000 })
    expect(getSettingsSnapshot()['brand.name']).toBe(defaultSettingsValues()['brand.name'])
    expect(getSettingsSnapshot()['payment.provider']).toBe('creem')
  })

  it('TTL 内不重复读库', async () => {
    const select = vi.fn(() => ({ from: () => Promise.resolve([]) }))
    const countingDb = { select } as never
    await loadSettings(countingDb, { now: 1_000 })
    expect(select).toHaveBeenCalledTimes(1)
    await loadSettings(countingDb, { now: 1_000 + 29_000 })
    expect(select).toHaveBeenCalledTimes(1)
    await loadSettings(countingDb, { now: 1_000 + 31_000 })
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('读库失败时退回出厂配置而不是抛错', async () => {
    const failing = {
      select: () => ({
        from: () => Promise.reject(new Error('no such table: settings')),
      }),
    } as never
    await expect(loadSettings(failing, { now: 1_000 })).resolves.toBeDefined()
    expect(getResolvedConfig().metadata.name).toBe(baseConfig.metadata.name)
  })

  it('保存后立即生效并提升版本号', async () => {
    const { db, state } = fakeDb()
    await loadSettings(db, { now: 1_000 })
    const before = getSettingsVersion()

    await saveSettingsGroup(db, 'brand', {
      'brand.name': 'Acme',
      'brand.logoAccent': 'e',
      'brand.tagline': '标语',
    })

    expect(state.rows.some((row) => row.key === 'brand.name')).toBe(true)
    expect(getResolvedConfig().metadata.name).toBe('Acme')
    expect(getSettingsVersion()).toBe(before + 1)
  })

  it('库里的字段被删掉后回落到出厂值，不留上一次的值', async () => {
    const { db } = fakeDb([storedRow('brand.name', 'Acme')])
    await loadSettings(db, { now: 1_000 })
    expect(getResolvedConfig().metadata.name).toBe('Acme')

    await loadSettings(fakeDb().db, { now: 1_000 + 31_000 })
    expect(getResolvedConfig().metadata.name).toBe(baseConfig.metadata.name)
  })

  it('保存非法值直接抛错且不落库', async () => {
    const { db, state } = fakeDb()
    await expect(saveSettingsGroup(db, 'brand', { 'brand.name': 123 })).rejects.toThrow()
    expect(state.rows).toHaveLength(0)
  })

  it('保存只影响该组，其余字段保持原值', async () => {
    const { db } = fakeDb()
    await loadSettings(db, { now: 1_000 })
    await saveSettingsGroup(db, 'payment', { 'payment.provider': 'creem' })
    expect(getSettingsSnapshot()['payment.provider']).toBe('creem')
    expect(getSettingsSnapshot()['brand.name']).toBe(defaultSettingsValues()['brand.name'])
  })

  it('settingsCacheFresh 反映缓存新鲜度', async () => {
    const { db } = fakeDb()
    expect(settingsCacheFresh(1_000)).toBe(false)
    await loadSettings(db, { now: 1_000 })
    expect(settingsCacheFresh(1_000)).toBe(true)
    expect(settingsCacheFresh(1_000 + 31_000)).toBe(false)
  })
})

describe('密钥入库', () => {
  const KEY = 'test-encryption-key-0123456789'

  beforeEach(() => {
    setResolvedConfig(baseConfig)
    resetSettingsCache()
  })

  it('密钥加密后落库，读回时解密', async () => {
    const { db, state } = fakeDb()
    await loadSettings(db, { now: 1_000, encryptionKey: KEY })
    await saveSettingsGroup(
      db,
      'stripe',
      { 'stripe.secretKey': 'sk_live_abc123456' },
      {
        encryptionKey: KEY,
      },
    )

    const row = state.rows.find((item) => item.key === 'stripe.secretKey')
    const stored = JSON.parse(row?.value ?? '""') as string
    expect(isEncrypted(stored)).toBe(true)
    expect(stored).not.toContain('sk_live_abc123456')

    resetSettingsCache()
    await loadSettings(db, { now: 2_000, encryptionKey: KEY })
    expect(getSettingsSnapshot()['stripe.secretKey']).toBe('sk_live_abc123456')
  })

  it('缺加密口令时拒绝保存密钥', async () => {
    const { db, state } = fakeDb()
    await loadSettings(db, { now: 1_000, encryptionKey: KEY })
    await expect(
      saveSettingsGroup(db, 'stripe', { 'stripe.secretKey': 'sk_live_abc123456' }),
    ).rejects.toThrow()
    expect(state.rows).toHaveLength(0)
  })

  it('缺加密口令时公开参数仍可保存', async () => {
    const { db } = fakeDb()
    await loadSettings(db, { now: 1_000 })
    await expect(saveSettingsGroup(db, 'stripe', { 'stripe.secretKey': '' })).resolves.toBeDefined()
  })

  it('空密钥值表示保持原值，不会被清空', async () => {
    const { db } = fakeDb()
    await loadSettings(db, { now: 1_000, encryptionKey: KEY })
    await saveSettingsGroup(
      db,
      'stripe',
      { 'stripe.secretKey': 'sk_live_keep' },
      {
        encryptionKey: KEY,
      },
    )
    await saveSettingsGroup(db, 'stripe', { 'stripe.secretKey': '' }, { encryptionKey: KEY })
    expect(getSettingsSnapshot()['stripe.secretKey']).toBe('sk_live_keep')
  })

  it('口令不对时密文字段回落默认值，不抛错', async () => {
    const { db } = fakeDb()
    await loadSettings(db, { now: 1_000, encryptionKey: KEY })
    await saveSettingsGroup(
      db,
      'stripe',
      { 'stripe.secretKey': 'sk_live_abc' },
      {
        encryptionKey: KEY,
      },
    )

    resetSettingsCache()
    await loadSettings(db, { now: 2_000, encryptionKey: `${KEY}-wrong` })
    expect(getSettingsSnapshot()['stripe.secretKey']).toBe('')
  })
})

describe('运行期 env 派生', () => {
  beforeEach(() => {
    setResolvedConfig(baseConfig)
    resetSettingsCache()
  })

  it('配置值覆盖部署 env 里的同名键', async () => {
    const { db } = fakeDb()
    const baseEnv = { STRIPE_SECRET_KEY: 'from-env', NODE_ENV: 'test' } as never
    await loadSettings(db, { now: 1_000, baseEnv, encryptionKey: 'k'.repeat(20) })
    await saveSettingsGroup(
      db,
      'stripe',
      { 'stripe.secretKey': 'from-db' },
      {
        baseEnv,
        encryptionKey: 'k'.repeat(20),
      },
    )
    expect(getRuntimeServerEnv(baseEnv).STRIPE_SECRET_KEY).toBe('from-db')
  })

  it('配置为空时 env 值不再生效（env 只作 seed 初值）', async () => {
    const { db } = fakeDb()
    const baseEnv = { STRIPE_SECRET_KEY: 'from-env', NODE_ENV: 'test' } as never
    await loadSettings(db, { now: 1_000, baseEnv })
    expect(getRuntimeServerEnv(baseEnv).STRIPE_SECRET_KEY).toBeUndefined()
  })

  it('布尔字段翻译成 true/false 字面量', async () => {
    const { db } = fakeDb()
    await loadSettings(db, { now: 1_000 })
    await saveSettingsGroup(db, 'creem', { 'creem.debug': true })
    expect(getRuntimeServerEnv().CREEM_DEBUG).toBe('true')
  })
})
