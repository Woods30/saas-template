import { watchFile } from 'node:fs'
import { cloudflare } from '@cloudflare/vite-plugin'
import contentCollections from '@content-collections/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import {
  GENERATED_INDEX_PATH,
  normalizeGeneratedFile,
} from './scripts/normalize-content-collections.ts'

/**
 * 抹掉 content-collections 生成头的时间戳，避免每次 dev/build 都留下噪音 diff。
 *
 * build 侧必须标 `sequential: true`：Vite 8 的 `buildStart` 是并发钩子，仅靠注册顺序
 * 无法保证在本插件之前跑完 content-collections 的 `builder.build()`。dev 侧不走
 * `buildStart`，改用轮询；`normalizeGeneratedFile` 只在内容变化时写回，不会自激。
 */
function normalizeContentCollectionsHeader(): Plugin {
  return {
    name: 'normalize-content-collections-header',
    buildStart: {
      sequential: true,
      handler: () => {
        normalizeGeneratedFile(GENERATED_INDEX_PATH)
      },
    },
    configureServer() {
      // 轮询而非 fs.watch：跨平台稳定，且规避编辑器原子写产生的 rename 事件。
      watchFile(GENERATED_INDEX_PATH, { interval: 300 }, () => {
        normalizeGeneratedFile(GENERATED_INDEX_PATH)
      })
    },
  }
}

export default defineConfig({
  // Vite 8 内置 tsconfig paths 解析，无需再装 `vite-tsconfig-paths`。
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // cloudflare 必须最先注册：它注入 `cloudflare:env` 等虚拟模块并接管 ssr environment。
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    // 编译 `project.inlang` 到 `src/locale/paraglide`，与 CLI 共享同一份配置。
    paraglideVitePlugin({ project: './project.inlang' }),
    // Tailwind v4 官方推荐置于 tanstackStart 之后。
    tailwindcss(),
    // 缺少本插件时 `vite dev` 会直接抛错：Start 的 React dev 模式依赖 /@react-refresh。
    viteReact(),
    contentCollections(),
    // 依赖上一条的 `buildStart`，必须排在其后。
    normalizeContentCollectionsHeader(),
  ],
})
