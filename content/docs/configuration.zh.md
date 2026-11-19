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
  secret: false,                // 是否加密入库、只回显末四位
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

设置页按 tab 组织，tab 下是分组卡片，按卡片保存：

| Tab | 分组 | 内容 |
|---|---|---|
| 通用 | 品牌 | 站名、标语、字标强调色 |
| 通用 | SEO | 默认标题 / 描述 / 关键词，以及分语言的覆盖 |
| 通用 | 社交链接 | 11 个平台地址，非法或带凭据的 URL 被丢弃 |
| 通用 | 文档站 | 独立文档站的地址与「根路径进文档」开关 |
| 模块 | 模块 | 11 个模块开关（docs / blog / changelog / mail / contact / newsletter / payment / manualPayments / notification / analytics / auth） |
| 用户 | 用户功能 | 用户侧开关（`userFeatures.*`）：账单、核销、API 密钥、通知 |
| 认证 | 认证 | 邮箱验证要求、Google 登录凭据、Turnstile 站点与服务端 key |
| 支付 | 支付 | 渠道与结账链路（`provider` / `manual_payments`） |
| 支付 | Stripe / Creem | 各自的密钥与 webhook 密钥；Creem 另有商品映射与沙箱开关 |
| 支付 | 核销 | 核销时效、收款账户清单（二维码走站内路径） |
| 邮件 | 邮件 | 渠道、支持邮箱、发件地址 |
| 邮件 | Resend / Cloudflare Email | 各自的凭据 |
| 邮件 | 订阅 | 订阅渠道（resend / beehiiv）与凭据 |
| 分析 | 分析 | 渠道多选（GA / Plausible / Umami / Clarity）与各自的公开标识 |
| 通知 | 通知 | 渠道（Discord / 飞书）与 webhook 地址 |

## 密钥加密入库

带 `secret: true` 的字段以 AES-GCM 加密后存进 `settings`：

- 密钥由 `CONFIG_ENCRYPTION_KEY` 经 `SHA-256` 派生；
- 密文形如 `enc:v1:` + base64（iv ‖ ciphertext）；
- 后台只回显末四位（`••••••••ab12`），留空表示**保持原值**；
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

## 门禁语义

模块开关只从配置读。关闭时对应页面与 API 一起 404（API 返回 `404 MODULE_DISABLED`）；
开启但必要配置缺失时，API 返回 `503 SERVICE_UNAVAILABLE`，页面与导航入口照常显示。

`getServiceStatuses()` 把每个模块标成 `disabled` / `incomplete` / `configured`，
缺的字段连位置一起报（`环境变量` / `数据库配置` / `源码配置`）。管理台概览与 `pnpm check`
都读这份诊断。

`auth.requireEmailVerification` 是**安全控制**，不是邮件开关：下游把邮箱当身份依据
（支付渠道的 `customerEmail`、`ADMIN_EMAILS`）。要求验证但邮件未配齐时，`auth` 报
`incomplete`、认证 API 返回 503，不会自动降级为免验证登录。

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

想改品牌与支持邮箱，用 `--brand` / `--tagline` / `--email`，或直接进后台。
