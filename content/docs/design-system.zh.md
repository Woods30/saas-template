---
title: 设计系统
description: 颜色、字体、尺度、工作台布局与品牌 Logo
locale: zh
order: 20
group: develop
updated: 2026-10-21
---

页面上的每个颜色、字号、圆角、阴影都应能在这里找到出处。**唯一事实来源是代码**：
取值在 `src/styles/globals.css`，仓库根 `DESIGN.md` 有更完整的一版。两者冲突时以 CSS
为准。

## 设计立场

1. **紫只出现在强调位。** 主色、链接、选中态、小面积菜单面。正文区、代码块、边框
   一律中性灰。把紫铺到整块版面，页面会泛薰衣草色。
2. **三层纵深。** 浅色：页面底冷白 < 卡片纯白；深色：页面底最深 < 卡片抬亮一档。
   侧栏与页面底**同色**，靠 1px 描边分界。
3. **模板优先。** 所有视觉决策走语义 token，下游改一处即可换肤。

## 设置

### 颜色

只用语义 token。**不写具体色阶**——`bg-zinc-100`、`text-gray-500`、`bg-white`、`#6B46FF`
一律禁止。需要中性色时用 `bg-foreground/10` 这类派生写法。

| token | 用途 | 注意 |
|---|---|---|
| `--background` / `--foreground` | 页面底 / 正文 | 对比度 18.01 / 17.39 |
| `--card` / `--popover` | 浮起的面 | 比 background 亮一档 |
| `--primary` | 主色、链接、选中 | 深色档前景用**墨色**，白字过不了 AA |
| `--secondary` | 次级面 | 带紫调，**只作小面积底色** |
| `--muted` | 大面积分区 | 近乎无彩的冷灰 |
| `--muted-foreground` | 次要文本 | 对比度 6.13 / 6.29 |
| `--accent` | 菜单 hover、选中项底色 | 是**面**不是强调色，不要画点线 |
| `--highlight` | 装饰点、轨道、连接线 | 同色相更浅一档 |
| `--destructive` / `--success` / `--warning` | 状态语义 | 只作文字 / 图标色 |
| `--border` | 分隔线 | 中性 |
| `--input` | 表单描边 | **比 border 深一档**，满足 3:1 |
| `--sidebar` | 侧栏底 | **与 background 同值** |
| `--chart-1..5` | 图表默认序列 | 只用于数据可视化 |

> 两条测试守着这条规则：`tests/unit/theme-consistency.test.ts` 扫描 `src/`（排除
> `ui/` 与 `mail/`），发现色值字面量即失败。新增例外要在测试里写明原因。

### 字体

| token | 值 | 说明 |
|---|---|---|
| `--font-sans` | Inter Variable → Quicksand → 系统栈 | 正文 |
| `--font-mono` | JetBrains Mono Variable → 系统等宽 | 代码 |
| `--tracking-normal` | `-0.01em` | 与 Inter 字形配套 |

字体由 `@fontsource-variable/*` 自托管，**不走 Google Fonts**——CSP 的 `font-src` 因此
不必放开第三方源，也没有首屏外链。

> 三套字体都不含中日韩字形。`--font-sans` 里必须保留 `PingFang SC` / `Microsoft YaHei`
> 后备项，否则中文会落到浏览器默认字体。

### 尺度

| 维度 | 取值 |
|---|---|
| `--radius` | `0.75rem`（`sm/md` 减 4/2px，`xl` 加 4px） |
| 卡片圆角 | `rounded-xl` |
| 表格外框 | `rounded-lg` |
| `--shadow-2xs..2xl` | 八档，浅色档投影色是品牌紫 |
| `--card-spacing` | `1.5rem` |

> **阴影必须分主题写，不能用 `light-dark()`。** 它只在颜色上下文里被解析，
> `box-shadow` 会把它当未知值，结果是 `box-shadow: none`。

### 换主题

1. 从 registry 取真实取值，不要照抄网页上的 CSS：

   ```bash
   curl -sL https://tweakcn.com/r/themes/<id>
   ```

2. 逐对校验对比度（正文 ≥ 4.5:1，非图形 ≥ 3:1），不过关的按 `DESIGN.md` 的修正表处理。
3. 新增 token 在 `:root` 与 `@theme inline` **两处**都声明，只写一半会让某主题取值为空。
4. 同步四处：`website.ts` 的 `ui.themeColor`、`public/manifest.json`、
   `src/mail/components/EmailLayout.tsx` 的 `EMAIL_THEME`、`content/docs/configuration*.md`。
5. 跑 `pnpm test`，`theme-colors.test.ts` 会守住漂移。

## 工作台布局

`DashboardLayout` 用 shadcn 的 `sidebar` + `SidebarInset`，侧栏 `variant="inset"`。

- **侧栏保持 `inset`**：内容区是浮起面板（`m-2` + `rounded-xl` + `shadow-sm`），
  边界靠 `shadow-sm` 与顶栏细线读出。本主题 `--sidebar` 与 `--background` 同值，
  不要因此判定「inset 看不出来」而改回默认 variant。
- **内容区用 `max-w-6xl`**：工作台既有单列表单也有 5–6 列表格，窄栏会把表格列挤在一起。
- **`SidebarInset` 必须带 `min-w-0`**：它是 flex item，默认 `min-width: auto`，
  宽表格的 min-content 会把它撑出视口，整页横向滚动。
- **表格窄屏逐级收起次要列**（`hidden sm:table-cell`），不要指望横向滚动——滚动区会
  把主操作按钮推出屏幕外。行操作多时收进 `DropdownMenu`。
- **表格外框不要写在调用处**：由 `globals.css` 的 `[data-slot='table-container']` 与
  `[data-slot='table-header']` 统一给。表格页**不要**再套一张 `Card`——会变成「框里套框」。
- **卡片间距不要逐处写 `p-6`**：`ui/card` 把 `--card-spacing` 写死在 utility 类里，
  由 `globals.css` 统一拉到 24px。
- **主题切换收在用户菜单里**，与「个人中心 / 退出登录」同组。窄屏（`md` 以下）侧栏是
  抽屉，此时顶栏单独放一个 `ThemeToggle`。
- **用户菜单从侧栏右缘向外展开**：`side={isMobile ? 'bottom' : 'right'}` +
  `align="end"`。早先向上弹出会挡住内容区一大块。

## 品牌 Logo

Logo 走**内联 SVG，不用 `<img>`**。CSS 变量无法穿透 `<img>` 的文档边界，用 `<img src>`
的话主题切换对 Logo 完全无效。

- `BrandLogo` 用 `?raw` 把 SVG 当文本导入，剥离资产自带的 `<style>`（它带
  `:root{--jbx-*}` 默认值，不剥会覆盖站点主题），再改写成呈现属性后注入。
- `--jbx-*` 用**品牌稿原色**，不映射站点 token：墨色 `#111318`、品牌紫 `#6948FF`。
  站点 `--primary` 浅色档同取 `#6948FF`，两者天然一致。
- **禁止用 CSS 滤镜推导深色版。** `invert` / `hue-rotate` 是全局色矩阵，字标的深墨色
  与品牌紫无法同时映射正确。
- **首屏 mascot 的两份位图必须同画幅同构图**，由 `.leap-mascot-on-dark` 按主题切换。
  切换用 `visibility` 而非 `display`——后者会让父级高度塌陷。

**替换成你自己的品牌**：

1. 把 SVG 放进 `src/components/layout/brand/`，保持 `--jbx-*` 变量名；
2. 改 `src/config/website.ts` 的 `metadata.images`；
3. 品牌色与紫系差异大时，按上面的「换主题」重定 `--primary` 等 token。

## 参考资料

- [shadcn/ui · Theming](https://ui.shadcn.com/docs/theming)
- [Tailwind CSS v4 · Theme variables](https://tailwindcss.com/docs/theme)

## 下一步

- [目录结构](./project-structure)——改哪个文件
- [表单约定](./forms)——表单控件的统一写法
- [网站配置](./configuration)——`metadata.images` 与 `ui.themeColor`
