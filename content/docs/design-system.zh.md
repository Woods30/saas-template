---
title: 设计系统
description: 颜色、字体、尺度 token 与换品牌 Logo 的位置
locale: zh
order: 24
group: develop
updated: 2026-11-03
---

页面上每个颜色、字号、圆角、阴影都能追溯到这页。**事实来源是代码**：取值在
`src/styles/globals.css`，仓库根 `DESIGN.md` 有更完整的规则说明，两者冲突时以 CSS 为准。

## 颜色

只用语义 token，**不写具体色阶**——`bg-zinc-100`、`text-gray-500`、`bg-white`、`#6B46FF`
一律禁止。需要中性色时用 `bg-foreground/10` 这类派生写法。

| token | 用途 | 注意 |
|---|---|---|
| `--background` / `--foreground` | 页面底 / 正文 | 对比度 18.01 / 17.39 |
| `--card` / `--popover` | 浮起的面 | 比 background 亮一档 |
| `--primary` / `--primary-foreground` | 主色、链接、选中 / 主色上的文字 | 深色档前景用**墨色**，白字过不了 AA |
| `--secondary` | 次级面 | 带紫调，**只作小面积底色** |
| `--muted` / `--muted-foreground` | 大面积分区 / 次要文本 | 近乎无彩的冷灰 |
| `--accent` | 菜单 hover、选中项底色 | 是**面**不是强调色，不要拿它画点线 |
| `--highlight` | 装饰点、轨道、连接线 | 同色相更浅一档，非文本图形 ≥ 3:1 |
| `--destructive` / `--success` / `--warning` | 状态语义 | 只作文字 / 图标色 |
| `--border` / `--input` / `--ring` | 分隔线 / 表单描边 / 焦点环 | `--input` 比 `--border` 深一档，满足 3:1 |
| `--sidebar` 及 `--sidebar-*` | 侧栏 | `--sidebar` 与 `--background` 同值，靠 `--sidebar-border` 分界 |
| `--chart-1..5` | 图表默认序列 | 只用于数据可视化 |

`tests/unit/theme-consistency.test.ts` 会扫描 `src/`（排除 `ui/` 与 `mail/`），发现色值
字面量即失败——新增例外要在测试里写明原因。

最小示例：

```tsx
<div className="bg-background text-foreground">
  <div className="bg-card text-card-foreground rounded-xl border border-border p-6">
    <p className="text-muted-foreground">次要说明</p>
    <button className="bg-primary text-primary-foreground rounded-md px-4 py-2">
      主操作
    </button>
  </div>
</div>
```

## 字体

| token | 值 | 说明 |
|---|---|---|
| `--font-sans` | Inter Variable → Quicksand Variable → 系统栈 | 正文 |
| `--font-mono` | JetBrains Mono Variable → 系统等宽 | 代码 |
| `--font-display` | Quicksand Variable → Inter Variable | 品牌字标 |
| `--tracking-normal` | `-0.01em` | 与 Inter 字形配套 |

字体由 `@fontsource-variable/*` 自托管，**不走 Google Fonts**——CSP 的 `font-src` 因此
不必放开第三方源，也没有首屏外链。

三套字体都不含中日韩字形，`--font-sans` 里的 `PingFang SC` / `Microsoft YaHei` 后备项
必须保留，否则中文会落到浏览器默认字体。

## 尺度

| 维度 | 取值 |
|---|---|
| `--radius` | `0.75rem`（`sm`/`md` 减 4/2px，`xl` 加 4px） |
| 卡片圆角 | `rounded-xl` |
| 表格外框 | `rounded-lg` |
| `--card-spacing` | `1.5rem` |
| `--shadow-2xs..2xl` | 八档，浅色档投影色是品牌紫 |

**阴影必须分主题写，不能包在 `light-dark()` 里。** 它只在颜色上下文里被解析，
`box-shadow` 会把它当未知值，结果是 `box-shadow: none`。

## 换主题配色

1. 从 registry 取真实取值，不要照抄网页上贴的 CSS：

   ```bash
   curl -sL https://tweakcn.com/r/themes/<id>
   ```

2. 逐对校验对比度（正文 ≥ 4.5:1，非文本图形 ≥ 3:1），不过关的按 `DESIGN.md` 的修正表处理。
3. 新增 token 在 `:root` 与 `@theme inline` **两处**都声明，只写一半会让某主题取值为空。
4. 同步四处：`src/config/website.ts` 的 `ui.themeColor`、`public/manifest.json`、
   `src/core/email/components/EmailLayout.tsx` 的 `EMAIL_THEME`、`content/docs/configuration*.md`。
5. 跑 `pnpm test`，`theme-colors.test.ts` 与 `theme-tokens.test.ts` 会守住漂移。

## 换品牌 Logo

Logo 分成**图形标记**与**站名**两部分：

- 图形标记是静态 SVG，放在 `src/components/layout/brand/`，`BrandLogo.tsx` 用 `?raw` 把它
  当文本导入、剥掉资产自带的 `<style>` 后注入。**保持 SVG 里 `<style>` 声明的变量名与
  class 名不变**——`BrandLogo.tsx` 按 class 名把它们映射到 CSS 变量，改名会丢掉映射。
- 站名是**文本**，取自 `src/config/website.ts` 的 `metadata.name`，用 `--font-display` 渲染。
  字标刻意没烘焙进 SVG，换了项目名页头上还是旧品牌。

替换成自己的品牌时改这几处：

| 改什么 | 在哪 |
|---|---|
| 图形标记 | `src/components/layout/brand/` 下的 SVG |
| 站名 | `src/config/website.ts` 的 `metadata.name` |
| 双色字标的强调后缀 | `src/config/website.ts` 的 `metadata.logoAccent`（没有就留空） |
| 分享图与图标 | `src/config/website.ts` 的 `metadata.images` |
| 浏览器地址栏配色 | `src/config/website.ts` 的 `ui.themeColor` |

Logo 走**内联 SVG，不用 `<img>`**：CSS 变量穿不过 `<img>` 的文档边界，用 `<img src>`
的话主题切换对 Logo 完全无效。**禁止用 CSS 滤镜推导深色版**——`invert` / `hue-rotate`
是全局色矩阵，无法把墨色与品牌紫同时映射正确。
