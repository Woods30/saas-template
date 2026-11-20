import { describe, expect, it } from 'vitest'
import { findBoundaryViolations } from '../../scripts/check-boundaries'

const file = (path: string, content: string) => ({ path, content })

describe('findBoundaryViolations', () => {
  it('允许 routes 从模块的 service 入口导入', () => {
    const violations = findBoundaryViolations([
      file('src/routes/api/credits.ts', `import { getBalance } from '@/modules/credits/service'`),
    ])
    expect(violations).toEqual([])
  })

  it('禁止 routes 穿过 service 导入模块内部文件', () => {
    const violations = findBoundaryViolations([
      file(
        'src/routes/api/credits.ts',
        `import { ledger } from '@/modules/credits/internal/ledger'`,
      ),
    ])
    expect(violations).toHaveLength(1)
    expect(violations[0]?.rule).toBe('module-public-entry')
    expect(violations[0]?.file).toBe('src/routes/api/credits.ts')
  })

  it('禁止从模块根路径导入（模块只暴露 service.ts）', () => {
    const violations = findBoundaryViolations([
      file('src/routes/api/credits.ts', `import { getBalance } from '@/modules/credits'`),
    ])
    expect(violations.map((v) => v.rule)).toEqual(['module-public-entry'])
  })

  it('模块内部可以自由导入自己目录下的文件', () => {
    const violations = findBoundaryViolations([
      file('src/modules/credits/service.ts', `import { ledger } from './internal/ledger'`),
      file(
        'src/modules/credits/internal/ledger.ts',
        `import { query } from '@/modules/credits/internal/query'`,
      ),
    ])
    expect(violations).toEqual([])
  })

  it('允许跨模块调用对方的 service 入口', () => {
    const violations = findBoundaryViolations([
      file(
        'src/modules/subscriptions/service.ts',
        `import { revoke } from '@/modules/credits/service'`,
      ),
    ])
    expect(violations).toEqual([])
  })

  it('禁止跨模块导入对方的内部文件', () => {
    const violations = findBoundaryViolations([
      file(
        'src/modules/subscriptions/service.ts',
        `import { ledger } from '@/modules/credits/internal/ledger'`,
      ),
    ])
    expect(violations.map((v) => v.rule)).toEqual(['module-public-entry'])
  })

  it('core 不得依赖任何模块', () => {
    const violations = findBoundaryViolations([
      file('src/core/auth/session.ts', `import { getBalance } from '@/modules/credits/service'`),
    ])
    expect(violations.map((v) => v.rule)).toEqual(['core-imports-module'])
  })

  it('core 与 modules 都不得依赖 routes', () => {
    const violations = findBoundaryViolations([
      file('src/core/db/index.ts', `import { route } from '@/routes/api/payment'`),
      file('src/modules/credits/service.ts', `import { route } from '@/routes/api/payment'`),
    ])
    expect(violations.map((v) => v.rule)).toEqual(['core-imports-route', 'module-imports-route'])
  })

  it('识别 re-export 与动态 import', () => {
    const violations = findBoundaryViolations([
      file('src/routes/index.ts', `export * from '@/modules/credits/internal/ledger'`),
      file('src/routes/api/x.ts', `const m = await import('@/modules/credits/internal/ledger')`),
    ])
    expect(violations).toHaveLength(2)
  })

  it('忽略外部包与 core 内部导入', () => {
    const violations = findBoundaryViolations([
      file('src/routes/api/x.ts', `import { z } from 'zod'`),
      file('src/routes/api/x.ts', `import { getConfig } from '@/core/config/service'`),
    ])
    expect(violations).toEqual([])
  })
})
