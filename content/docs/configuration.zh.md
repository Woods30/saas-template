---
title: 网站配置
description: 配置注册表、后台设置、密钥加密与门禁语义
locale: zh
order: 2
group: config
updated: 2026-11-19
---

站点配置的数据源只有一个：数据库 `settings` 表，一字段一行。后台「系统设置」保存后
**立即生效**，不用发版。运行期不读环境变量——env 只在 `pnpm db:seed` 时作为初值。

## 配置在哪：注册表

`src/core/config/registry.ts` 是配置的**唯一事实来源**。每个字段声明：

```ts
{
  key: 'brand.name',            // settings 表的主键，点号分节
  kind: 'text',                 // 决定后台用什么控件、如何校验
  label: () => m.…(),           // 文案
  defaultValue: 'Jerbix',       // 库里没存时的值
  secret: false,                // 是否加密入库、不回显明文
  envKey: 'RESEND_API_KEY',     // 只在 db:seed 时读环境变量的这个名字
}
```

后台表单、种子、逐字段校验与 `settings` 表都从这里派生。新增一个配置项只需要改注册表与
文案，页面不用动。

数据流：

```text
settings 行 → 解密 → 逐字段校验 → resolveSettingsValues → applySettingsToConfig
            → setResolvedConfig → 全站 websiteConfig
```

同一份值还会经 `settingsToServerEnv` 翻译成 `RuntimeEnv`（键名沿用环境变量名），放进
每请求的 `ServerContext`，供支付 / 邮件 / 通知等消费方使用。

## 后台分区

设置页按 tab 组织，共 **9 个 tab**。每个 tab 顶部**只有一个保存按钮**，提交该 tab 下的
所有分组——收起的分组也一并提交。分组卡片可单独折叠；折叠只是视图状态，不影响保存。
唯一的例外是「自定义配置」tab：它渲染独立的面板，自带保存按钮（整表替换，不按 tab
提交），见下文「自定义配置仅服务端可读」。
切换 tab 不会丢未保存的草稿，保存某个 tab 也不会重置其它 tab 的草稿。

| Tab | 分组 | 内容 |
|---|---|---|
| 基础与外观 | 品牌 | 站名、标语、字标强调色 |
| 基础与外观 | SEO | 默认标题 / 描述 / 关键词，以及分语言的覆盖 |
| 基础与外观 | 社交链接 | 11 个平台地址，非法或带凭据的 URL 被丢弃 |
| 用户 | 用户中心功能 | 入口开关（`userFeatures.*`）：账单、核销、API 密钥、通知偏好 |
| 用户 | 注册 | 新用户默认角色（`user` / `viewer` / `editor`）与注册赠积分（启用 / 数量 / 有效天数 / 描述） |
| 内容 | 内容模块 | docs / blog / changelog / contact 开关 |
| 内容 | 文档站 | 独立文档站的地址与「根路径进文档」开关 |
| 认证与安全 | 登录方式 | 邮箱 / Google / GitHub 开关与邮箱验证要求 |
| 认证与安全 | Google / GitHub / Turnstile | OAuth 凭据与 Turnstile 站点 / 服务端 key |
| 支付 | 支付模块 | payment / manualPayments 开关 |
| 支付 | 支付渠道 | 渠道与结账链路（`provider` / `manual_payments`） |
| 支付 | Stripe / Creem | 各自的密钥与 webhook 密钥；Creem 另有商品映射与沙箱开关 |
| 支付 | 核销收款 | 核销时效、收款账户清单（二维码走站内路径） |
| 邮件 | 邮件模块 | mail / newsletter 开关 |
| 邮件 | 邮件 | 渠道、支持邮箱、发件地址 |
| 邮件 | Resend / Cloudflare Email | 各自的凭据 |
| 邮件 | 邮件订阅 | 订阅渠道（resend / beehiiv）与凭据 |
| 分析 | 分析模块 | analytics 开关 |
| 分析 | 流量分析 | 渠道多选（GA / Plausible / Umami / Clarity）与各自的公开标识 |
| 通知 | 通知模块 | notification 开关 |
| 通知 | 通知渠道 | 渠道（Discord / 飞书）与 webhook 地址 |
| 自定义配置 | — | 任意 `custom.<key>` 键值行，含密钥 |

### 模块开关与用户中心功能开关

模块开关决定**能力是否存在**：模块关闭时页面与 API 一起 404。用户中心功能开关
（`userFeatures.*`）只决定**入口是否出现**，不启用或停用底层模块。例如
`modules.payment` 开着而 `userFeatures.billing` 关掉，能力仍在，只是用户中心不显示账单页。

### 认证没有总开关

`modules.auth` 已删除。认证可用性由三个方法开关（`auth.emailEnabled` /
`auth.googleEnabled` / `auth.githubEnabled`）决定，保存时**至少保留一个**。三个全关的
提交会被拒绝，后台无法把自己锁在门外；但直接改数据库仍可能关掉全部方式，这是运维风险。

### 自定义配置仅服务端可读

「自定义配置」tab 把不在注册表里的键存为 `custom.<key>`。键格式与保留前缀会被校验，
密钥值同样加密入库、不回显明文；面板自己拉取、自己保存（整表替换，不按 tab 保存）。
自定义值**不进入**公开的 `websiteConfig`，只能在服务端通过 `getCustomSetting(key)` 读取。

## 密钥加密入库

带 `secret: true` 的字段以 AES-GCM 加密后存进 `settings`：

- 密钥由 `CONFIG_ENCRYPTION_KEY` 经 `SHA-256` 派生；
- 密文形如 `enc:v1:` + base64（iv ‖ ciphertext）；
- 后台不回显明文（接口只返回掩码），输入框留空表示**保持原值**；
- `CONFIG_ENCRYPTION_KEY` 缺失时，含密钥的配置组拒绝保存；公开参数仍可写；
- 口令换了或丢了，旧密文解不开，字段回落默认值——只能重填。

`CONFIG_ENCRYPTION_KEY` 不进数据库，也不与数据库同处一个备份。见
[环境变量](./environment)。

## 生效顺序与一致性

1. 数据库里存了的字段 → 用它；
2. 没存 → 注册表默认值；
3. 单个字段校验失败（类型不对、URL 非法）→ **只丢这一个字段**，回落默认值，其余照常；
4. 一组字段里有非法的 → 该组保存被拒，库里旧值不动。

运行期快照带 30 秒 TTL；保存后本 isolate 立即刷新，其它 isolate 最长 30 秒后跟上。

## 管理台门禁

进入管理台需要持有**任意** `admin.*` 权限点（`*` 与裸 `admin` 也算）。判定是
`hasAdminAccess(permissions)`，而不是 `matchPermission('admin.*', permissions)`——后者会把
持有 `admin.content.read` 这类具体权限点的用户挡在外面。没有管理台权限的用户得到 404
而不是 403，不暴露管理台的存在。

进入后，菜单项再按各自的权限点过滤：只持 `admin.content.read` / `admin.tickets.read` 的
用户可以进管理台、看到「内容」分组，但看不到用户、角色、审计、付款、积分与系统设置。
一个分组里的菜单项全被过滤掉时，整组不渲染。每个 server function 会重复同样的权限检查，
隐藏入口只是使用便利，不是安全边界。

## 门禁语义

模块开关只从配置读。关闭时对应页面与 API 一起 404（API 返回 `404 MODULE_DISABLED`）；
开启但必要配置缺失时，API 返回 `503 SERVICE_UNAVAILABLE`，页面与导航入口照常显示。

`getServiceStatuses()` 把每个模块标成 `disabled` / `incomplete` / `configured`，
缺的字段连位置一起报（`环境变量` / `数据库配置` / `源码配置`）。管理台概览与 `pnpm check`
都读这份诊断。

`auth.requireEmailVerification` 默认关闭：注册即登录，不发验证邮件。设为开启后它同时是
**安全控制**，不是邮件开关：下游把邮箱当身份依据（支付渠道的 `customerEmail`、
`ADMIN_EMAILS`）。要求验证但邮件未配齐时，`auth` 报 `incomplete`、认证 API 返回 503，
不会自动降级为免验证登录。

## 不在注册表里的结构值

有些值不面向后台，仍在 `src/config/website.ts` 里：

| 字段 | 说明 |
|---|---|
| `metadata.images.*` | OG 图、浅色 / 深色 Logo、站点图标 |
| `ui.defaultTheme` / `enableThemeSwitch` / `themeColor` | 主题与地址栏配色 |
| `landingOffer` | 首页 CTA 指向哪个商品与购买方式 |
| `pages.waitlist` | 等候名单页开关 |

`themeColor` 必须与 `styles/globals.css` 里 `--background` 的明暗取值一致：这两个值渲染在
页面之外，读不到 CSS 变量。改主题时两处一起改。

配置里**不存金额**：价格只存在于支付服务商的价格目录，首页展示与结账收款读同一份；
`landingOffer` 的商品与购买方式必须能在 `src/config/products.ts` 里找到对应引用。

## 初始化

```bash
pnpm db:setup
pnpm db:seed           # 注册表默认值 + .env 里的初值
```

`db:seed` 默认只补缺失字段（`DO NOTHING`），不覆盖后台改过的值；`--force` 才全量覆盖。
它还会清掉注册表之外的旧键，避免「哪一份生效」再次含糊。

### 从旧版本升级

`features.*` 与 `modules.auth` 已删除。旧库可能仍留着这些行；运行期会忽略它们，但清理掉
才能让表保持诚实：

```bash
pnpm db:cleanup:settings          # 本地 D1
pnpm db:cleanup:settings:remote   # 远端 D1
```

脚本只删除 `features.*` 键与 `modules.auth`，其它配置原样保留。跨这次变更升级后跑一次即可。

任何版本升级后都跑一次 `pnpm db:seed` 同步权限目录（例如 AI 任务变更新增的
`admin.tasks.write`）。权限是目录数据而非用户数据，即使不加 `--force` 也会 upsert；
`roles` 与 `settings` 仍保持「默认不覆盖」的语义。

想改品牌与支持邮箱，用 `--brand` / `--tagline` / `--email`，或直接进后台。
