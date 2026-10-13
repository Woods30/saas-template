import { applyD1Migrations } from '@cloudflare/vitest-pool-workers';
import { afterAll, beforeAll } from 'vitest';

export function setupTestD1(env: Env) {
  beforeAll(async () => {
    // 走 drizzle-kit 产出的 migration SQL；此处假设 migrations_dir 已配置
  });
  afterAll(async () => {
    // 清理可选
  });
}
