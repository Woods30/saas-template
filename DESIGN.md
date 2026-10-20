# DESIGN.md

本仓的设计系统。改 UI 之前先读这一页；页面上的每个颜色、字号、圆角、阴影都应能
在这里找到出处。

**唯一事实来源是代码**：颜色与尺度的实际取值在 `src/styles/globals.css`。本文描述
规则与理由，两者冲突时以 CSS 为准，并顺手修正本文。

## 设计立场

三条约束决定了其余所有选择：

1. **紫只出现在强调位。** 主色、链接、选中态、小面积的菜单面。正文区、代码块、边框
   一律中性灰（C ≤ 0.02）。把紫铺到整块版面，页面会泛薰衣草色。
2. **三层纵深。** 浅色：页面底冷白 < 卡片纯白；深色：页面底最深 < 卡片抬亮一档。
   侧栏与页面底**同色**，靠 1px 描边分界——这是 shadcn dashboard 的默认层次。
3. **模板优先。** 所有视觉决策走语义 token，下游改一处即可换肤，不需要翻组件源码。

## 颜色

配色来自 tweakcn 主题 `cmvd8fl4i000104l4ctz6amjc`，在 `globals.css` 中转成
`light-dark(明, 暗)` 单声明。**明暗不是两套变量**，同一个 token 声明两个值，
由 `color-scheme` 决定取哪一个。

### 语义 token

| token | 用途 | 约束 |
|---|---|---|
| `--background` | 页面底 | 冷白 `#FCFAFF` / 近黑 `#0A0A0F` |
| `--foreground` | 正文 | 对 background 18.01 / 17.39 |
| `--card` / `--popover` | 浮起的面 | 比 background 亮一档 |
| `--primary` | 主色、链接、选中 | 浅 `#6B46FF` / 深 `#8061FF` |
| `--primary-foreground` | 主色上的文字 | **深色档用墨色**，白字过不了 AA |
| `--secondary` | 次级面 | 带紫调，**只作小面积底色** |
| `--muted` | 大面积分区 | 近乎无彩的冷灰 |
| `--muted-foreground` | 次要文本 | 对 background 6.13 / 6.29 |
| `--accent` | 菜单 hover、选中项底色 | 是**面**不是强调色，不要画点线 |
| `--highlight` | 装饰点、轨道、连接线 | 同色相更浅一档，非文本图形 ≥ 3:1 |
| `--destructive` / `--success` / `--warning` | 状态语义 | 只作文字 / 图标色，需底色时配 `/10` |
| `--border` | 分隔线 | 中性 |
| `--input` | 表单控件描边 | **比 border 深一档**，满足 3:1 |
| `--ring` | 焦点环 | 与 primary 同色同值 |
| `--sidebar` | 侧栏底 | **与 background 同值**，靠 `--sidebar-border` 分界 |
| `--chart-1..5` | 图表默认序列 | 只用于数据可视化 |

### 硬规则

- **不写具体色阶**：`bg-zinc-100`、`text-gray-500`、`bg-white`、`#6B46FF` 一律禁止。
  需要中性色时用 `bg-foreground/10` 这类 token 派生写法。
- **上游组件不改**：`src/components/ui/` 里 shadcn 原件的 `bg-black/10` 是上游的一部分，
  在调用处用 `className` 覆盖。
- **两条测试守着这条规则**：`tests/unit/theme-consistency.test.ts` 扫描 `src/`
  （排除 `ui/` 与 `mail/`），发现色值字面量即失败；`theme-colors.test.ts` 校验
  `website.ts` 的 `themeColor` 与 `globals.css` 等价。新增例外要在测试里写明原因。
- **邮件是唯一例外**：邮件客户端不执行站点 CSS，颜色集中在
  `src/mail/components/EmailLayout.tsx` 的 `EMAIL_THEME`，改主题时同步。

### 对比度修正（不要「还原」）

第三方主题普遍过不了 WCAG AA。本仓对导出稿做了这几处修正：

| token | 原值问题 | 修正 |
|---|---|---|
| 深色 `--primary` | 压在 card 上 4.28:1 | L 提到 0.615（4.51:1） |
| 深色 `--primary-foreground` | 白字仅 ~3.9:1 | 改用墨色（4.79:1） |
| 浅色 `--accent/secondary-foreground` | 4.42:1 | L 用 0.545（4.63:1） |
| `--input` | 与 border 同值，1.22:1 | 独立加深到 3.61 / 3.36 |
| `--destructive` | 3.15 / 2.38 | 两档重定 L |
| 深色 `--sidebar-accent-foreground` | 3.76:1 | L 提到 0.66（4.61:1） |

## 字体

| token | 值 | 说明 |
|---|---|---|
| `--font-sans` | Inter Variable → Quicksand → 系统栈 | 正文 |
| `--font-mono` | JetBrains Mono Variable → 系统等宽 | 代码 |
| `--font-serif` | Georgia / Songti SC | 极少使用 |
| `--tracking-normal` | `-0.01em` | 与 Inter 字形配套 |

三套字体由 `@fontsource-variable/*` 自托管，**不走 Google Fonts**——CSP 的 `font-src`
因此不必放开第三方源，也没有首屏外链。

**三套字体都不含中日韩字形。** `--font-sans` 里必须保留 `PingFang SC` /
`Microsoft YaHei` 后备项，否则中文会落到浏览器默认字体。

## 尺度

| 维度 | 取值 | 说明 |
|---|---|---|
| `--radius` | `0.75rem` | 基准；`sm/md` 减 4/2px，`xl` 加 4px |
| 卡片圆角 | `rounded-xl` | 比表格外框大一档 |
| 表格外框 | `rounded-lg` | shadcn dashboard 约定 |
| `--shadow-2xs..2xl` | 八档 | 浅色档投影色是品牌紫 `#6b46ff` |
| `--card-spacing` | `1.5rem` | 覆盖 `ui/card` 硬编码的 `--spacing(4)` |

**阴影必须分主题写，不能用 `light-dark()`。** `light-dark()` 只在颜色上下文里被解析，
`box-shadow` 会把它当未知值，结果是 `box-shadow: none`。浅色档写在 `@theme inline`，
深色档用 `:root[data-theme="dark"]` 与 `:root[data-theme="system"]` 两段覆盖。

## 层次模型

```
浅色：  background (冷白)  <  card / popover (纯白)
深色：  background (最深)  <  card / popover (抬亮一档)

侧栏：  与 background 同色，靠 --sidebar-border 的 1px 描边分界
```

- `--sidebar-border` **不得**转发 `--background` / `--border`，必须独立取值。
- `--sidebar` **不得**转发 `--card`——转发过去侧栏会变成卡片色，整页塌成一块。

## 组件约定

- **先找现成组件。** shadcn / Base UI 有对应组件就直接用，没有才手写。破坏性确认用
  `AlertDialog`（不用 `window.confirm`），空态用 `Empty` / `Spinner`，状态标记用 `Badge`。
- **`src/components/ui/` 是上游原件的拷贝，一律不本地修改。** 需要调整外观时在调用处
  传 `className`，或用组合件包一层。
- **新增组件用 CLI 安装**，不要手抄源码：

  ```bash
  pnpm dlx shadcn@latest add <component> -y
  ```

- **表单统一用 TanStack Form + Zod `validators` + `Field` 组合件**，不要手搓 `useState`
  管错误，也不要自己写输入控件。
- **图标用 Tabler**（`@tabler/icons-react`），与 `components.json` 的 `iconLibrary` 一致。
- **菜单、弹窗用 Base UI 组合件**。在 `fixed z-10` 的容器（如侧栏）内嵌 Base UI `Menu`
  时，`Positioner` 必须加 `z-50`，否则菜单不可见也不可点。

## 品牌 Logo

Logo 走**内联 SVG，不用 `<img>`**。CSS 变量无法穿透 `<img>` 的文档边界，用 `<img src>`
的话主题切换对 Logo 完全无效。

- `BrandLogo` 用 `?raw` 把 `src/components/layout/brand/jerbix-horizontal.svg` 当文本
  导入，剥离资产自带的 `<style>`（它带 `:root{--jbx-*}` 默认值，不剥会覆盖站点主题），
  再按 class 名改写成呈现属性后注入。
- `--jbx-*` 用**品牌稿原色**，不映射站点 token：墨色 `#111318`、品牌紫
  `#6948FF` / `#8066FF` 是设计方定的识别色。站点 `--primary` 浅色档同取 `#6948FF`，
  两者天然一致；深色档 `--primary` 提亮到 `#8C77FF`（对比度需要），与 `--jbx-accent`
  略有差异，这是有意的。
- **禁止用 CSS 滤镜从浅色 Logo 推导深色版。** `invert` / `hue-rotate` 是全局色矩阵，
  字标的深墨色与品牌紫无法同时映射正确。
- **首屏 mascot 的两份位图必须同画幅同构图**（`mascot.png` / `mascot-dark.png`），
  由 `.leap-mascot-on-dark` 按主题切换。切换用 `visibility` 而非 `display`——后者会让
  父级高度塌陷。

**替换成你自己的品牌**：

1. 把 SVG 放进 `src/components/layout/brand/`，保持 `--jbx-*` 变量名；
2. 改 `src/config/website.ts` 的 `metadata.images`（`logoLight` / `logoDark` / `icon` /
   `ogImage`）；
3. 若品牌色与紫系差异大，按下面的「换主题」流程重定 `--primary` 等 token。

## 换主题

1. **以 registry JSON 为准**，不要照抄网页上贴的 CSS：

   ```bash
   curl -sL https://tweakcn.com/r/themes/<id>
   ```

   取 `cssVars.light` / `cssVars.dark`，合成一条 `light-dark(明, 暗)`。网页导出稿可能
   与 registry 不同版本（本仓曾因此整块 sidebar / chart 取值对不上）。

2. **逐对校验对比度**（正文 ≥ 4.5:1，非文本图形 ≥ 3:1），按上面的「对比度修正」表
   处理不过关的项。

3. **新增 token 必须成对声明**：在 `:root` 用 `light-dark(明, 暗)` 写全，并在
   `@theme inline` 中映射为工具类。只声明一半会导致某一主题下取值为空。

4. **同步四处**：

   | 位置 | 内容 |
   |---|---|
   | `src/config/website.ts` | `ui.themeColor`（浏览器地址栏，页面外渲染，读不到 CSS） |
   | `public/manifest.json` | `background_color` / `theme_color` |
   | `src/mail/components/EmailLayout.tsx` | `EMAIL_THEME`（邮件不执行站点 CSS） |
   | `content/docs/configuration*.md` | 文档里的示例值 |

5. 跑 `pnpm test`——`theme-colors.test.ts` 与 `theme-tokens.test.ts` 会守住漂移。

## 工作台布局

`DashboardLayout` 用 shadcn 的 `sidebar` + `SidebarInset`，侧栏 `variant="inset"`，
布局基线对齐 tweakcn 主题的 dashboard 示例。

- 侧栏宽度、折叠态、移动端抽屉由 `ui/sidebar` 原件的 `SidebarProvider` 管理，**不要在
  页面里自己写媒体查询**。
- 工作台页面统一用 `SettingsLayout` 骨架：左侧分区导航、右侧内容区。新增分区改
  `src/config/settings.ts`，不要复制一份布局。
- 页面标题与说明用 `SettingsSection`，操作按钮放右上角，不要散在正文里。
- 侧栏内嵌的 Base UI 菜单必须给 `Positioner` 加 `z-50`（见「组件约定」）。

## 改设计时的检查清单

- [ ] 没有新增色值字面量（跑 `pnpm test` 让测试确认）
- [ ] 新 token 在 `:root` 与 `@theme inline` 两处都声明
- [ ] 明暗两档都看过，对比度达标
- [ ] `ui/` 目录没有改动
- [ ] 换了颜色的话，上面「同步四处」都改了
