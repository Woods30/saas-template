import { cloudflare } from '@cloudflare/vite-plugin'
import contentCollections from '@content-collections/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
  ],
})
