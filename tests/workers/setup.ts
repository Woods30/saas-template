import { afterAll, beforeAll } from 'vitest'

export function setupTestD1(_env: Env) {
  beforeAll(async () => {
    // 用 drizzle-kit 产出的 migration SQL；假设 migrations_dir 已配置。
  })
  afterAll(async () => {
    // 清理可选
  })
}
