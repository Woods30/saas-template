import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const srcAlias = fileURLToPath(new URL('./src', import.meta.url))
// 与 tsconfig 的 `content-collections` path 对齐：sitemap / legal 等纯逻辑会读生成的
// 博客 / 文档清单，单测需要同一别名才能解析该模块。
const contentCollectionsAlias = fileURLToPath(
  new URL('./.content-collections/generated/index.js', import.meta.url),
)

export default defineConfig({
  test: {
    // 两组 project 合并：unit（node，内联）与 components（jsdom，引用独立配置文件）。
    // 此前 components 只靠一个无人引用的 vitest.workspace.ts 聚合，实际 `vitest run`
    // 只跑 unit，components 的 19 个文件被漏掉。workers 组（0 用例）不并入默认。
    projects: [
      'vitest.components.config.ts',
      {
        resolve: { alias: { '@': srcAlias, 'content-collections': contentCollectionsAlias } },
        test: {
          name: 'unit',
          environment: 'node',
          globals: false,
          // 邮件模板的 actionUrl 白名单从站点 base URL 派生，夹具统一用 example.com。
          env: { VITE_BASE_URL: 'https://example.com' },
          setupFiles: ['tests/setup.ts'],
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
          // 默认 5s 在并行高负载下偶发超时（实测全量曾 14 failed，重跑全绿），调高消除 flakiness。
          testTimeout: 15000,
          hookTimeout: 15000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/index.ts',
        'src/**/*.types.ts',
        'src/**/*.schemas.ts',
        'src/locale/paraglide/**',
        'src/**/__tests__/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80, perFile: false },
    },
  },
})
