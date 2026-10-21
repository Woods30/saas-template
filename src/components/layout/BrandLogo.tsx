import horizontalSvg from './brand/jerbix-horizontal.svg?raw'

/**
 * 品牌 Logo（Jerbix Brand Pack v4）。必须内联 SVG，不能用 `<img>`——CSS 变量
 * 无法穿透 `<img>` 的文档边界，主题色会停在资产里写死的值。宽度由外部
 * `className` 控制，颜色读 `--jbx-*`。
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ display: 'inline-block', lineHeight: 0 }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 静态品牌资产，非用户输入
      dangerouslySetInnerHTML={{ __html: prepareSvg(horizontalSvg) }}
    />
  )
}

/**
 * 处理打包进来的 SVG：剥离自带 `<style>`（其 `:root` 默认值会污染站点 token），
 * 把 class 改写为等价的 `fill` / `stroke` 属性，并让尺寸跟随外层容器。
 */
function prepareSvg(source: string): string {
  const withoutStyle = source.replace(/<style>[\s\S]*?<\/style>/, '')

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
