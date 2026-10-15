import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 与 tsconfig 的 `content-collections` path 对齐：真实 Router 会加载使用
      // content-collections 的路由（如 sitemap / legal），组件测试需要同一别名。
      'content-collections': fileURLToPath(
        new URL('./.content-collections/generated/index.js', import.meta.url),
      ),
    },
  },
  test: {
    name: 'components',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: [
      'tests/components/**/*.test.tsx',
      'tests/components/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
