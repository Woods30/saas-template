import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    // cloudflare 必须最先注册：它注入 `cloudflare:env` 等虚拟模块并接管 ssr environment。
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    // Tailwind v4 官方推荐置于 tanstackStart 之后，负责编译 `@import 'tailwindcss'`。
    tailwindcss(),
    // TanStack Start 的 React dev 模式依赖 /@react-refresh（见 start-plugin-core 的
    // createDevClientEntryPlugin），缺少本插件时 `vite dev` 会直接抛错。
    viteReact(),
    // tsconfigPaths 放最后，统一处理 `@/*` 等路径别名。
    tsconfigPaths(),
  ],
})
