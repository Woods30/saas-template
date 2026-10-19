import horizontalSvg from './brand/jerbix-horizontal.svg?raw'

/**
 * 品牌 Logo（Jerbix Brand Pack v4）。
 *
 * v4 是**纯矢量**方案，不再是位图：字标、吉祥物、飘带都是 path，颜色由
 * `--jbx-*` CSS 变量驱动（在 `globals.css` 里映射到本项目的语义 token）。
 *
 * **必须内联 SVG，不能用 `<img>`**：CSS 变量无法穿透 `<img>` 的文档边界，
 * 用 `<img src>` 的话主题色永远停在资产里写死的浅色值。
 *
 * 组件只负责注入 SVG；配色、尺寸都交给外部 CSS：
 * - 宽度由 `className`（如 `w-36`）控制，SVG 自身没有 width/height；
 * - 颜色读 `--jbx-text` / `--jbx-accent` / `--jbx-mascot` / `--jbx-code`。
 *
 * 资产内嵌的 `<style>` 已被剥离（见下方 `stripInlineStyles`）：它带 `:root`
 * 默认值，内联进页面会全局覆盖，让品牌色反过来污染站点 token。
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ display: 'inline-block', lineHeight: 0 }}
      // 内容是构建期打包进来的静态 SVG 文本，不含任何运行时输入。
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 静态品牌资产，非用户输入
      dangerouslySetInnerHTML={{ __html: prepareSvg(horizontalSvg) }}
    />
  )
}

/**
 * 把打包进来的 SVG 处理成可安全内联的形式。
 *
 * 1. 去掉 `<style>` 块：资产自带的 `:root{--jbx-*:…}` 是给独立文档用的，
 *    内联后会覆盖站点主题；
 * 2. 把样式改写成属性：剥离 `<style>` 后 class 失去定义，这里按 class 名
 *    补上 `fill` / `stroke`，值仍指向 CSS 变量，主题切换照样生效；
 * 3. 补 `width`/`height` 为 `100%`，让 SVG 跟随外层容器宽度缩放。
 */
function prepareSvg(source: string): string {
  const withoutStyle = source.replace(/<style>[\s\S]*?<\/style>/, '')

  // class → 呈现属性。与资产里 `<style>` 的定义一一对应。
  const classToAttrs: Record<string, string> = {
    'jbx-text': 'fill="var(--jbx-text, currentColor)"',
    'jbx-mascot': 'fill="var(--jbx-mascot, currentColor)"',
    'jbx-accent': 'fill="var(--jbx-accent, currentColor)"',
    'jbx-shadow': 'fill="var(--jbx-shadow, transparent)"',
    'jbx-code':
      'fill="none" stroke="var(--jbx-code, currentColor)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"',
  }

  return withoutStyle
    .replace(/class="([^"]+)"/g, (match, classes: string) => {
      const attrs = classes
        .split(/\s+/)
        .map((name) => classToAttrs[name])
        .filter(Boolean)
        .join(' ')
      return attrs || match
    })
    .replace('<svg ', '<svg width="100%" height="100%" ')
}
