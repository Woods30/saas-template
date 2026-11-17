import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const srcAlias = fileURLToPath(new URL('./src', import.meta.url))
// 与 tsconfig 的 `content-collections` path 对齐：sitemap / legal 等纯逻辑会读生成的
// 博客 / 文档清单，单测需要同一别名才能解析该模块。
const contentCollectionsAlias = fileURLToPath(
  new URL('./.content-collections/generated/index.js', import.meta.url),
)

/**
 * 测试场景固定值：模块与能力开关**不从 `website.ts` 的出厂值走**。
 *
 * 使用者会把出厂值改成自己的（模块按需开关、品牌换成自己的），测试若依赖出厂值，
 * 改过配置的项目就会集体变红。模板仓自己的套件必须在「模板的出厂值」与
 * 「使用者改过之后的出厂值」下都绿，所以场景固定在这里，由 env 覆盖。
 *
 * 名单是白名单语义：不在名单里的模块与能力一律关闭。
 */
export const testScenarioEnv = {
  VITE_MODULES: 'docs,blog,changelog,mail,payment,analytics,auth',
  VITE_FEATURES: 'enableI18n,enableApiKeys,enableAdmin',
}

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
          env: { VITE_BASE_URL: 'https://example.com', ...testScenarioEnv },
          setupFiles: ['tests/setup.ts'],
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
          // 默认 5s 在并行高负载下偶发超时（实测全量曾 14 failed，重跑全绿），调高消除 flakiness。
          // 30s：全量 107 个文件并行时，仍见过「import 一份编译产物」这类本该毫秒级的用例超时。
          testTimeout: 30000,
          hookTimeout: 30000,
          // 变换结果落盘缓存：paraglide 生成了 600 多个消息模块，每次重跑都重新变换
          // 是全量测试最大的开销，也偶发导致首次 import 的用例超时。
          fsModuleCache: true,
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
