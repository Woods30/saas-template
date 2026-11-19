import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decryptSecret,
  isEncrypted,
  MissingEncryptionKeyError,
  maskSecret,
} from '../../src/core/config/crypto'
import {
  isReservedCustomKey,
  listCustomSettings,
  pendingCustomKeyDeletes,
  replaceCustomSettings,
} from '../../src/core/config/custom'
import { SettingsValidationError } from '../../src/core/config/settings'
import { createTestDatabase } from '../helpers/database'

/**
 * 自定义键值配置（`custom.*` 命名空间）。
 *
 * 存储形状固定为 `settings.value = JSON.stringify({ v, s })`：`v` 是明文或
 * `enc:v1:` 密文，`s` 标记是否密钥。整表替换，密钥留空表示保持原值。
 */

const KEY = 'test-encryption-key-0123456789'

interface StoredRow {
  key: string
  value: string
}

function storedRows(sqlite: DatabaseSync): StoredRow[] {
  return sqlite
    .prepare('SELECT key, value FROM settings ORDER BY key')
    .all() as unknown as StoredRow[]
}

function storedValue(sqlite: DatabaseSync, key: string): { v: string; s: boolean } {
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  expect(row).toBeDefined()
  return JSON.parse(row?.value ?? '{}') as { v: string; s: boolean }
}

afterEach(() => {
  vi.doUnmock('@/lib/server-context')
  vi.doUnmock('@/core/db')
  vi.resetModules()
})

describe('自定义键写入', () => {
  it('自定义键写入 custom. 命名空间', async () => {
    const { db, sqlite } = createTestDatabase()
    await replaceCustomSettings(db, [{ key: 'checkout_note', value: 'hello', secret: false }])

    expect(storedRows(sqlite)).toEqual([
      { key: 'custom.checkout_note', value: JSON.stringify({ v: 'hello', s: false }) },
    ])
    sqlite.close()
  })

  it('非密钥空值原样存为空字符串', async () => {
    const { db, sqlite } = createTestDatabase()
    await replaceCustomSettings(db, [{ key: 'empty_value', value: '', secret: false }])

    expect(storedValue(sqlite, 'custom.empty_value')).toEqual({ v: '', s: false })
    sqlite.close()
  })

  it('整表替换会移除不再提交的条目，且不碰注册表行', async () => {
    const { db, sqlite } = createTestDatabase()
    sqlite
      .prepare('INSERT INTO settings(key, value, updated_at) VALUES (?, ?, 1)')
      .run('brand.name', JSON.stringify('Acme'))
    await replaceCustomSettings(db, [
      { key: 'first', value: '1', secret: false },
      { key: 'second', value: '2', secret: false },
    ])

    await replaceCustomSettings(db, [{ key: 'first', value: '1', secret: false }])

    expect(storedRows(sqlite).map((row) => row.key)).toEqual(['brand.name', 'custom.first'])
    sqlite.close()
  })

  it('删除条目会移除对应 settings 行', async () => {
    const { db, sqlite } = createTestDatabase()
    await replaceCustomSettings(db, [
      { key: 'keep', value: 'a', secret: false },
      { key: 'drop', value: 'b', secret: false },
    ])

    await replaceCustomSettings(db, [{ key: 'keep', value: 'a', secret: false }])

    const keys = storedRows(sqlite).map((row) => row.key)
    expect(keys).toEqual(['custom.keep'])
    sqlite.close()
  })

  it('待删键按 50 个一批切分，且只含未保留的键', () => {
    const existing = Array.from({ length: 120 }, (_, index) => `custom.k${index}`)
    const batches = pendingCustomKeyDeletes(existing, ['custom.k0', 'custom.k7'])

    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 18])
    const flattened = batches.flat()
    expect(flattened).toHaveLength(118)
    expect(new Set(flattened).size).toBe(118)
    expect(flattened).not.toContain('custom.k0')
    expect(flattened).not.toContain('custom.k7')
  })

  it('超过单条语句参数上限的旧行也能全部删除', async () => {
    const { db, sqlite } = createTestDatabase()
    const insert = sqlite.prepare('INSERT INTO settings(key, value, updated_at) VALUES (?, ?, 1)')
    for (let index = 0; index < 120; index++) {
      insert.run(`custom.old${index}`, JSON.stringify({ v: `v${index}`, s: false }))
    }

    await replaceCustomSettings(db, [{ key: 'keep', value: 'y', secret: false }])

    expect(storedRows(sqlite).map((row) => row.key)).toEqual(['custom.keep'])
    sqlite.close()
  })
})

describe('键规则', () => {
  it('注册表已有的键被拒绝', async () => {
    const { db, sqlite } = createTestDatabase()
    await expect(
      replaceCustomSettings(db, [{ key: 'brand.name', value: 'x', secret: false }]),
    ).rejects.toBeInstanceOf(SettingsValidationError)
    expect(storedRows(sqlite)).toHaveLength(0)
    sqlite.close()
  })

  it('保留前缀与 custom. 前缀被拒绝', async () => {
    const { db, sqlite } = createTestDatabase()
    for (const key of [
      'features.x',
      'modules',
      'modules.auth.token',
      'modules..auth',
      'Modules.x',
      'brand.custom',
      'custom.foo',
    ]) {
      await expect(
        replaceCustomSettings(db, [{ key, value: 'x', secret: false }]),
      ).rejects.toBeInstanceOf(SettingsValidationError)
    }
    expect(storedRows(sqlite)).toHaveLength(0)
    sqlite.close()
  })

  it('非法键格式被拒绝', async () => {
    const { db, sqlite } = createTestDatabase()
    for (const key of ['', 'a', '1abc', 'BadKey', 'has space', 'a'.repeat(65)]) {
      await expect(
        replaceCustomSettings(db, [{ key, value: 'x', secret: false }]),
      ).rejects.toBeInstanceOf(SettingsValidationError)
    }
    expect(storedRows(sqlite)).toHaveLength(0)
    sqlite.close()
  })

  it('重复键被拒绝', async () => {
    const { db, sqlite } = createTestDatabase()
    await expect(
      replaceCustomSettings(db, [
        { key: 'same', value: 'a', secret: false },
        { key: 'same', value: 'b', secret: false },
      ]),
    ).rejects.toBeInstanceOf(SettingsValidationError)
    expect(storedRows(sqlite)).toHaveLength(0)
    sqlite.close()
  })

  it('isReservedCustomKey 覆盖注册表键、顶层前缀与额外保留项', () => {
    expect(isReservedCustomKey('brand.name')).toBe(true)
    expect(isReservedCustomKey('brand.custom')).toBe(true)
    expect(isReservedCustomKey('modules')).toBe(true)
    expect(isReservedCustomKey('modules.auth')).toBe(true)
    expect(isReservedCustomKey('modules..auth')).toBe(true)
    expect(isReservedCustomKey('modules.anything')).toBe(true)
    expect(isReservedCustomKey('features')).toBe(true)
    expect(isReservedCustomKey('features.flags')).toBe(true)
    expect(isReservedCustomKey('myFlag')).toBe(false)
    expect(isReservedCustomKey('brandish')).toBe(false)
  })
})

describe('密钥条目', () => {
  it('secret 值加密且列表只回显掩码', async () => {
    const { db, sqlite } = createTestDatabase()
    await replaceCustomSettings(
      db,
      [{ key: 'api_token', value: 'sk_live_abc123456', secret: true }],
      { encryptionKey: KEY },
    )

    const stored = storedValue(sqlite, 'custom.api_token')
    expect(stored.s).toBe(true)
    expect(isEncrypted(stored.v)).toBe(true)
    expect(stored.v).not.toContain('sk_live_abc123456')

    const list = await listCustomSettings(db, KEY)
    expect(list).toEqual([
      { key: 'api_token', value: maskSecret('sk_live_abc123456'), secret: true },
    ])
    expect(list[0]?.value).not.toContain('sk_live_abc123456')
    sqlite.close()
  })

  it('缺加密口令时拒绝保存新的明文密钥，且不删除已有行', async () => {
    const { db, sqlite } = createTestDatabase()
    await replaceCustomSettings(db, [{ key: 'keep', value: 'a', secret: false }])

    await expect(
      replaceCustomSettings(db, [
        { key: 'keep', value: 'a', secret: false },
        { key: 'api_token', value: 'plain-secret', secret: true },
      ]),
    ).rejects.toBeInstanceOf(MissingEncryptionKeyError)

    expect(storedRows(sqlite).map((row) => row.key)).toEqual(['custom.keep'])
    sqlite.close()
  })

  it('空值或掩码表示保持已有密文，不重新加密', async () => {
    const { db, sqlite } = createTestDatabase()
    await replaceCustomSettings(
      db,
      [{ key: 'api_token', value: 'sk_live_abc123456', secret: true }],
      { encryptionKey: KEY },
    )
    const ciphertext = storedValue(sqlite, 'custom.api_token').v

    await replaceCustomSettings(db, [{ key: 'api_token', value: '', secret: true }], {
      encryptionKey: KEY,
    })
    expect(storedValue(sqlite, 'custom.api_token').v).toBe(ciphertext)

    await replaceCustomSettings(
      db,
      [{ key: 'api_token', value: maskSecret('sk_live_abc123456'), secret: true }],
      { encryptionKey: KEY },
    )
    expect(storedValue(sqlite, 'custom.api_token').v).toBe(ciphertext)

    // 没有口令时，保留已有密文也不需要口令。
    await expect(
      replaceCustomSettings(db, [{ key: 'api_token', value: '', secret: true }]),
    ).resolves.toBeUndefined()
    expect(storedValue(sqlite, 'custom.api_token').v).toBe(ciphertext)
    sqlite.close()
  })

  it('改名后未改动的掩码仍保留原密文，旧键被删除', async () => {
    const { db, sqlite } = createTestDatabase()
    await replaceCustomSettings(
      db,
      [{ key: 'old_token', value: 'original-secret', secret: true }],
      { encryptionKey: KEY },
    )
    const ciphertext = storedValue(sqlite, 'custom.old_token').v

    await replaceCustomSettings(
      db,
      [
        {
          key: 'new_token',
          value: maskSecret('original-secret'),
          secret: true,
          originalKey: 'old_token',
        },
      ],
      { encryptionKey: KEY },
    )

    expect(storedRows(sqlite).map((row) => row.key)).toEqual(['custom.new_token'])
    const stored = storedValue(sqlite, 'custom.new_token')
    expect(stored.v).toBe(ciphertext)
    await expect(decryptSecret(stored.v, KEY)).resolves.toBe('original-secret')

    const list = await listCustomSettings(db, KEY)
    expect(list).toEqual([{ key: 'new_token', value: maskSecret('original-secret'), secret: true }])
    sqlite.close()
  })
})

describe('getCustomSetting', () => {
  it('解密后返回原值，键不存在时返回 undefined', async () => {
    const { db, sqlite } = createTestDatabase()
    await replaceCustomSettings(
      db,
      [
        { key: 'token', value: 'plain-secret', secret: true },
        { key: 'label', value: 'hello', secret: false },
      ],
      { encryptionKey: KEY },
    )

    vi.resetModules()
    vi.doMock('@/lib/server-context', () => ({
      getServerContext: () => ({ env: { CONFIG_ENCRYPTION_KEY: KEY } }),
    }))
    vi.doMock('@/core/db', async () => {
      const actual = await vi.importActual<typeof import('@/core/db')>('@/core/db')
      return { ...actual, createDbFromEnv: async () => db }
    })

    const { getCustomSetting } = await import('../../src/core/config/custom')
    await expect(getCustomSetting('token')).resolves.toBe('plain-secret')
    await expect(getCustomSetting('label')).resolves.toBe('hello')
    await expect(getCustomSetting('missing')).resolves.toBeUndefined()
    sqlite.close()
  })
})
