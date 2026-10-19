import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { websiteConfig } from '@/config/website'

/**
 * 守卫：浏览器 UI 配色与 CSS 主题底色保持一致。
 *
 * `theme-color`（地址栏 / 状态栏）与 PWA manifest 的 `background_color` 由浏览器在
 * 页面之外渲染，读不到 CSS 变量，只能在配置与静态文件里各写一份。这份测试把两份
 * 抄写绑回 `globals.css` 的 `--background`：改主题底色却忘了同步时直接失败，而不是
 * 等到真机上看出一条色差。
 */

/** 把 `oklch(L C H)` 转成 `#RRGGBB`（sRGB）。与浏览器渲染同一套换算。 */
function oklchToHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b

  const l3 = lPrime ** 3
  const m3 = mPrime ** 3
  const s3 = sPrime ** 3

  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]

  return `#${linear
    .map((channel) => {
      const clamped = Math.min(1, Math.max(0, channel))
      const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
      return Math.round(encoded * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase()
    })
    .join('')}`
}

/** 从 globals.css 读出 `--background` 的明暗两值，转成 hex。 */
function backgroundFromCss(): { light: string; dark: string } {
  const css = readFileSync(new URL('../../src/styles/globals.css', import.meta.url), 'utf-8')
  const match = css.match(
    /--background:\s*light-dark\(\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)\s*,\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)\s*\)/,
  )
  if (!match) throw new Error('globals.css 中找不到 --background 的 light-dark() 声明')
  // 正则的 6 个捕获组在 match 成功时必然都存在，这里的解构是安全的。
  const [lL, lC, lH, dL, dC, dH] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  return { light: oklchToHex(lL, lC, lH), dark: oklchToHex(dL, dC, dH) }
}

describe('浏览器配色与 CSS 主题一致', () => {
  it('theme-color 与 globals.css 的 --background 等价', () => {
    const css = backgroundFromCss()
    expect(websiteConfig.ui.themeColor).toEqual(css)
  })

  it('manifest 的 background_color 等于浅色主题底色', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf-8'),
    )
    expect(manifest.background_color.toUpperCase()).toBe(backgroundFromCss().light)
  })
})
