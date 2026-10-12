import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock node:fs before importing the module under test.
vi.mock('node:fs', () => ({
  readFileSync: vi.fn<(filePath: string, encoding: string) => string>(),
  writeFileSync: vi.fn<(filePath: string, content: string) => void>(),
  existsSync: vi.fn<(filePath: string) => boolean>(),
}))

// Import after vi.mock so mocks are active.
import { readEnv, writeEnv } from '../../scripts/setup'

const { readFileSync, writeFileSync, existsSync } = await import('node:fs')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readEnv', () => {
  it('解析合法 .env', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      'BETTER_AUTH_SECRET=abc123\nSTRIPE_SECRET_KEY=sk_test_xyz\n',
    )
    const env = readEnv()
    expect(env).toEqual({
      BETTER_AUTH_SECRET: 'abc123',
      STRIPE_SECRET_KEY: 'sk_test_xyz',
    })
  })

  it('忽略注释行', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      '# comment\nBETTER_AUTH_SECRET=secret\n# another comment\nSTRIPE_SECRET_KEY=sk_test\n',
    )
    const env = readEnv()
    expect(env).toEqual({
      BETTER_AUTH_SECRET: 'secret',
      STRIPE_SECRET_KEY: 'sk_test',
    })
  })

  it('处理不存在的 .env → 返回空对象', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const env = readEnv()
    expect(env).toEqual({})
  })
})

describe('writeEnv', () => {
  it('输出按 key 排序的 .env 格式', () => {
    writeEnv({ BETTER_AUTH_SECRET: 'abc', STRIPE_SECRET_KEY: 'xyz' })
    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string
    const lines = written.trim().split('\n')
    expect(lines[0]).toBe('BETTER_AUTH_SECRET=abc')
    expect(lines[1]).toBe('STRIPE_SECRET_KEY=xyz')
  })

  it('readEnv + writeEnv 往返保持一致', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    const original = 'BETTER_AUTH_SECRET=roundtrip_value\nSTRIPE_SECRET_KEY=sk_test\n'
    vi.mocked(readFileSync).mockReturnValue(original)

    const env = readEnv()
    writeEnv(env)

    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string
    expect(written).toContain('BETTER_AUTH_SECRET=roundtrip_value')
    expect(written).toContain('STRIPE_SECRET_KEY=sk_test')
  })
})
