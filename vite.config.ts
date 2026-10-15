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
} from './scripts/normalize-content-collections'

/**
 * 消除 content-collections 生成头的时间戳噪音。
 *
 * `@content-collections/core` 把 `new Date()` 写进 `.content-collections/generated/index.js`
 * 首行，导致 `pnpm dev` / `pnpm build` 每次都留下噪音 diff。`content:build` 脚本已在 CLI
 * 侧规范化，但 Vite 的 `contentCollections()` 插件在 `buildStart` / 自身 watcher 里直接
 * 重建该文件，绕过了 CLI，故此处再补一层覆盖三条路径：
 *
 * - **build**：`buildStart` 在 content-collections 构建完成后规范化。注意 Vite 8 的
 *   `buildStart` 走 `hookParallel`（非 `sequential` 钩子并发执行），仅靠注册顺序无法保证
 *   先后，故本钩子标记 `sequential: true`，令其在前序并发钩子（含 content-collections 的
 *   `await builder.build()`）全部结束后才执行。
 * - **dev**：content-collections 插件在 `configureServer` 里 `builder.watch()` 重建文件，
 *   不经过 Vite 的 `buildStart`，故用 `fs.watchFile` 轮询该文件并在变更时规范化。
 *   规范化是幂等的，且 `normalizeGeneratedFile` 以 `after !== before` 守卫写回，
 *   已规范化的文件不会再落盘，避免「写 → 触发变更 → 再写」死循环。
 */
function normalizeContentCollectionsHeader(): Plugin {
  return {
    name: 'normalize-content-collections-header',
    buildStart: {
      sequential: true,
      handler: () => {
        // 首次内容构建前文件可能不存在，normalizeGeneratedFile 会静默 no-op。
        normalizeGeneratedFile(GENERATED_INDEX_PATH)
      },
    },
    configureServer() {
      // 轮询而非 fs.watch：跨平台稳定、无依赖，且规避编辑器原子写导致的 rename 事件。
      watchFile(GENERATED_INDEX_PATH, { interval: 300 }, () => {
        normalizeGeneratedFile(GENERATED_INDEX_PATH)
      })
    },
  }
}

export default defineConfig({
  // Vite 8 内置 tsconfig paths 解析，直接读取 tsconfig.json 的 `paths`（如 `@/*`），
  // 无需再安装 `vite-tsconfig-paths` 插件（该插件在 Vite 8 下已打印弃用提示）。
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // cloudflare 必须最先注册：它注入 `cloudflare:env` 等虚拟模块并接管 ssr environment。
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    // Paraglide：编译 `project.inlang` 到 `src/locale/paraglide`，dev/build 时自动重建。
    // 编译选项（outdir/strategy 等）来自 `project.inlang/paraglide.config.ts`，与 CLI
    // 共享同一份配置，避免两侧策略不一致而互相覆写。
    paraglideVitePlugin({ project: './project.inlang' }),
    // Tailwind v4 官方推荐置于 tanstackStart 之后，负责编译 `@import 'tailwindcss'`。
    tailwindcss(),
    // TanStack Start 的 React dev 模式依赖 /@react-refresh（见 start-plugin-core 的
    // createDevClientEntryPlugin），缺少本插件时 `vite dev` 会直接抛错。
    viteReact(),
    // Content Collections：编译 `content/` 下 markdown 为 ESM 模块。
    // 放在 viteReact 之后（tsconfigPaths 在 Vite 8 中通过 resolve.tsconfigPaths 内联，不占插件位）。
    contentCollections(),
    // 必须在 contentCollections() 之后注册，并配合 `sequential: true`，确保在
    // content-collections 的 `buildStart`（`await builder.build()`）完成后才规范化。
    normalizeContentCollectionsHeader(),
  ],
})
