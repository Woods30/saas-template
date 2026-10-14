import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 与 tsconfig 的 `content-collections` path 对齐：sitemap 路径工厂等纯逻辑
      // 会读取生成的博客 / 文档清单，单测需要同一别名才能解析该模块。
      'content-collections': fileURLToPath(
        new URL('./.content-collections/generated/index.js', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // 纯导出/类型文件不算入阈值：blocks 索引、env schema、paraglide 生成
      exclude: [
        'src/**/index.ts',
        'src/**/*.types.ts',
        'src/**/*.schemas.ts',
        'src/locale/paraglide/**',
        'src/**/__tests__/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
        perFile: false,
      },
    },
  },
})
