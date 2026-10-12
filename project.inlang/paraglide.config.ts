/**
 * Paraglide 编译选项的单一事实来源。
 *
 * `paraglide-js compile`（CLI）与 `paraglideVitePlugin` 都读取本文件，二者因此
 * 使用完全一致的 project/outdir/strategy，不会互相覆写生成物。
 *
 * 语言协商顺序：
 * - `custom-server-locale`：服务端自定义策略，调用 `src/lib/locale.ts` 的
 *   `resolveLocale(request)`（cookie → Accept-Language → zh），是服务端唯一的解析入口。
 * - `cookie`：客户端读取 `NEXT_LOCALE`（与 `LocaleSwitcher` 写入的名字一致），
 *   保证切换后重载时 hydration 与服务端一致。服务端不会走到这里（自定义策略已命中）。
 * - `preferredLanguage`：客户端首次访问、尚无 cookie 时按 `navigator.language` 协商。
 * - `baseLocale`：兜底为 zh。
 *
 * `src/lib/locale.ts` 是服务端语言解析的唯一事实来源；`cookieName` 只是让客户端
 * 复用同一个 cookie 名，不引入第二套解析规则。
 */
import { defineConfig } from '@inlang/paraglide-js'

export default defineConfig({
  outdir: './src/locale/paraglide',
  cookieName: 'NEXT_LOCALE',
  strategy: ['custom-server-locale', 'cookie', 'preferredLanguage', 'baseLocale'],
  emitTsDeclarations: true,
})
