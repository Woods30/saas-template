# 网站源码配置与公共菜单设计

日期：2026-10-14。
状态：对话设计已获用户批准；本文件记录第一子项目的实施规格。

## 1. 目标与总体分工

参考 TanStarter 的配置组织方式，让 Jerbix 开发者通过类型安全的源码配置调整网站入口、品牌资源、社交链接与模块开关。开关必须由 UI、页面、API 和配置检查共同消费。

用户已确定：

- 使用源码配置与环境变量。
- 登录后提供最小账户工作台：侧栏、头像菜单、个人资料、账单与邮件订阅设置。
- 沿用现有服务商完成闭环。

整体工作分为五个独立子项目，各有规格、实施计划与验收：

1. 本规格：配置基础与公共菜单。
2. 认证与最小账户工作台：D1 持久认证、验证邮件、密码重置、工作台路由、资料、侧栏与头像菜单。
3. Stripe 支付与账单：套餐、Checkout、Customer 映射、Webhook、权益、账单与 Portal。
4. 邮件订阅与联系表单：名单范围、实际结果、本人状态、安全退订、双语邮件与联系投递。
5. 运营通知与 Analytics：事件与频道、投递结果、脚本、CSP、页面访问与转化事件。

第一子项目不实现账户页面、认证修复、商业套餐、支付数据迁移、订阅所有权、通知中心或分析看板。Sidebar、Avatar 的具体配置文件随第二子项目及真实路由一起创建；本次先交付可复用的菜单契约和过滤逻辑。未实现的路由不允许以字符串或类型断言提前填入菜单。

## 2. 当前源码事实

- Navbar 与 Footer 链接写在 JSX 内，Navbar 桌面与移动端重复编排。
- `websiteConfig.features` 多数开关没有消费者；`enableDocs=false` 与文档实际开放不一致。
- Newsletter、Contact、Payment API 未执行统一模块门禁。
- 文档侧栏从内容生成，应继续保留这一模式。
- 网站已有 Paraglide 的 zh / en；模块加载期调用消息函数会固化语言。
- 当前事务邮件支持 Resend / Cloudflare binding，支付仅 Stripe，名单订阅支持 Resend / Beehiiv，运营通知支持 Discord / Feishu，Analytics 有 GA / Plausible / Umami / Clarity 适配器。
- 这些服务存在独立业务缺口。配置完整只说明必要字段存在，不证明外部权限、投递、Webhook、权益或采集成功。
- 当前工作区包含已完成但未提交的 Landing Page 修改和用户原有迁移快照；执行本计划不得恢复、删除或一起提交这些改动。

## 3. 全局约束

- 使用现有 TanStack Start / TanStack Router、React 19、TypeScript strict、Tailwind CSS v4、Base UI、Tabler、Paraglide、Zod 与 pnpm；本子项目不添加依赖。
- 项目文档、注释及中文产品文案使用中文，中文与半角英数字之间添加半角空格。
- 支持 zh / en，默认 zh；复用 `src/lib/locale.ts` 与 Paraglide，不在网站配置复制 locales 清单。
- `websiteConfig` 模块加载期仅保存语言无关的公开值。
- 所有消息在工厂调用、组件 render 或每请求 head 中求值。
- 公开 env 只经 `src/env/public.ts` 读取；服务端 env 只经 `src/env/server.ts` 校验；secret 不得使用 `VITE_` 前缀或进入客户端配置。
- 不直接读取、打印或覆盖真实 `.env`；现有检查命令可按其校验契约读取配置且只输出字段名。不修改 Workers 生产设置，不上传 secret，不执行远程迁移、外部投递、真实支付或部署。
- 不手改 `src/routeTree.gen.ts` 或 Paraglide 生成文件。
- 保留用户指定的 `public/logo-horizontal-transparent.svg` 原图及深色主题浅色底片。
- 行为修改先写失败测试，确认失败原因后实施最小修改；结构整理与行为修改分开交付。
- 本次文档不执行 commit / push；未来提交须获授权，并使用项目规定的 attribution。

## 4. 配置边界与默认值

### 4.1 公共网站配置

在 `src/config/website.ts` 定义显式 `WebsiteConfig` 接口，并提供 `createWebsiteConfig(env: PublicEnv): WebsiteConfig`。Vite 消费 `createWebsiteConfig(publicEnv)`；CLI 使用传入的解析结果，不能在 tsx 中错误地采用 Vite 默认 env。

配置字段：

| 字段 | 内容 | 初始值 |
|---|---|---|
| `baseUrl` | 公开站点 origin | public env 的 `VITE_BASE_URL` |
| `metadata.name` | 品牌名 | Jerbix |
| `metadata.images.ogImage` | OG 资源 | `/logo.png` |
| `metadata.images.logoLight/logoDark` | 导航横版 Logo | `/logo-horizontal-transparent.svg` |
| `metadata.images.icon` | 页脚图标 | `/icon-jerboa.svg` |
| `ui.defaultTheme` | light / dark / system | system |
| `ui.enableThemeSwitch` | 是否显示主题切换 | true |
| `docs.enabled` | 文档页面与入口 | true |
| `blog.enabled` | 博客列表与详情 | true |
| `changelog.enabled` | 更新日志 | true |
| `mail.enabled/provider/supportEmail` | 邮件选项与公开联系地址 | false / resend / 空字符串 |
| `contact.enabled` | 联系页面与提交入口 | false |
| `newsletter.enabled/provider` | 名单订阅 | false / resend |
| `payment.enabled/provider/allowedPriceIds` | Stripe 入口与现有白名单 | false / stripe / 空数组 |
| `notification.enabled` | 运营通知 | false |
| `analytics.enabled/providers` | 分析开关与选中适配器 | false / 空数组 |
| `social` | 平台 URL 映射 | 空对象 |

文档、博客、更新日志按已存在的真实页面开放。未闭环的可选服务默认关闭；因此独立 `/pricing` 示例页及 `/contact` 占位页默认不可访问，但首页 `#pricing` 的源码说明和首页技术能力示意保留。

删除已有且被本次配置替代的 `features.enableDocs/enableNewsletter/enableContact` 与 `notification.enable`。其余尚无业务消费者的 `enableFileUpload/enableApiKeys/enableAdmin/enableAIGateway` 保留在 `features` 并明确为预留；不宣称它们可用。现有 i18n 始终保留，`features.enableI18n` 暂保留兼容，不新增关闭语言路由的行为。

不在本子项目加入尚无消费者的 OAuth、删除账户、订阅自动加入、支付套餐或通知事件配置。第二至第五子项目在实现消费者时扩展契约。

### 4.2 环境变量

新增 `MAIL_FROM`（服务端、纯邮箱地址）与 `VITE_UMAMI_SCRIPT_URL`（公开 HTTPS 脚本 URL）。只更新 schema、类型和 `.env.example` 说明；实际值由开发者另行配置。

- Resend / Cloudflare 默认发件人统一使用 `MAIL_FROM`，移除 `noreply@example.com` 的可发送回退。
- 原 `CLOUDFLARE_EMAIL_SENDER` 作为兼容字段保留；`MAIL_FROM` 缺失且选择 Cloudflare 时可用它。Resend 不借用 Cloudflare sender。
- Umami 启用时必须填写真实脚本 URL；移除示例主机作为就绪依据。脚本实际加载与 API 适配在第五子项目完成。
- 保留当前 GA / Clarity / Umami canonical 与 legacy ID；统一空值归一，优先 canonical，空 canonical 不屏蔽 legacy。
- Stripe 三项公开 Price ID 暂保留。支付启用时至少有一个显式 `allowedPriceIds`；第三子项目将白名单替换为权威套餐目录。

## 5. 菜单契约与消费

### 5.1 数据模型

共享 `MenuItem` 使用 `link / group / separator` 判别联合。每项都有稳定 `id`；link 与 group 有 `title`，可选 description / Tabler icon / visibility。

link 的 destination 再区分：

- internal：保存经 `linkOptions()` 校验的 `to / params / search / hash`。
- external：保存已校验的 `href` 与独立 `newTab`。

本子项目的站内 destination 只覆盖当前存在且可供公共菜单使用的首页、文档、博客、更新日志、法律、价格、联系和登录页面。统一目标工厂注入当前 locale；不同路由的 params 不能被压成无约束字符串映射。动态法律路由必须包含 slug。后续账户路由通过目标工厂增补。

退出登录不属于 URL 配置；未来 Avatar 组件直接消费 `signOut` 动作。

### 5.2 过滤

`visibility` 可指定模块、登录条件与角色。`filterMenuItems(items, context)` 为纯函数，递归过滤 group，删除空组，移除首尾和连续 separator，不修改输入数组。角色只用于展示；未知角色或未登录时不能通过需要角色的显示条件。

公开 Navbar / Footer 当前使用访客上下文；第二子项目接入真实 session 后才根据账户状态变化，不增加虚假会话数据。

### 5.3 配置工厂

- `getNavbarLinks(locale, context)`：特性、开始流程、模板内容三项首页锚点；文档按开关显示。
- `getFooterLinks(locale, context)`：产品与资源两组，保留现有内容；更新日志、博客、文档按开关过滤；法律链接常驻。
- `getNavbarActions(locale)`：登录入口和主 CTA；主 CTA 为文档，关闭文档时回首页 `#features`。
- `getSocialLinks(config, locale)`：只渲染配置了合法 URL 的平台。支持 GitHub、X、Bluesky、Mastodon、Discord、YouTube、LinkedIn、Facebook、Instagram、TikTok、Telegram；supportEmail 合法且非空时产生 mailto 联系入口。

社交 URL 只接受 HTTPS、无用户名密码的绝对 URL；Mastodon 等自托管平台不锁死 host。空值不输出；非法非空值令源码配置检查失败并在渲染中被过滤。mailto 仅由有效 supportEmail 构造。新标签页使用 `rel="noopener noreferrer"`，图标链接必须有可访问名称。

### 5.4 组件

新增 `MenuLink.tsx` 与 `MenuItems.tsx`，分别负责链接边界和递归菜单结构。Navbar 与 Footer 复用它们，保持当前版式、按钮、Logo、深色底片、Escape 关闭与焦点恢复行为。Navbar 的 group 使用原生 details / summary，支持键盘操作；Footer 分组使用 nav / h2，不做悬浮交互。

主题 default 值由网站配置统一决定；现有有效 THEME cookie 仍优先。关闭主题切换只隐藏按钮，不覆盖用户主题。

文档侧栏继续由内容生成；这里只修正返回首页的 locale 参数，并让其语言控件遵守既有语言行为。

## 6. 功能门禁与服务状态

### 6.1 页面

`assertPageEnabled(module)` 用于 docs 父路由、blog 列表及详情、changelog、pricing、contact。关闭时抛 TanStack `notFound()`；路由文件保持存在。页面入口和 sitemap 使用相同开关。

### 6.2 API

`getModuleUnavailableResponse(module)` 在 body 解析、鉴权、限流和 provider 调用之前运行，覆盖：

- newsletter POST / DELETE。
- contact POST。
- payment POST / DELETE。
- email POST。

关闭返回 404，JSON `{"error":"MODULE_DISABLED"}`。已启用但必要配置缺失或其依赖关闭返回 503，JSON `{"error":"SERVICE_UNAVAILABLE"}`。公开响应不带缺失凭据列表或值。

付款 Webhook 与发起新付款分开：关闭 payment 不应吞掉已发生付款的回调。Stripe Webhook 在验签前检查 Stripe 凭据是否完整；不完整返回 503 以允许 Stripe 重试；完整则继续执行现有验签、落库流程。Webhook 的乱序、幂等与权益修复属于第三子项目。

### 6.3 服务状态

`getServiceStatuses({config, publicEnv, serverEnv, bindings})` 为纯函数，返回 `disabled / incomplete / configured` 和只含字段名、原因、设置位置的 issues；不包含凭据值，不表示外部服务 ready。

必要条件：

| 模块 | 条件 |
|---|---|
| mail / Resend | RESEND_API_KEY、MAIL_FROM |
| mail / Cloudflare | EMAIL binding、MAIL_FROM 或 CLOUDFLARE_EMAIL_SENDER |
| contact | mail 已启用且配置完整、有效 supportEmail |
| newsletter / Resend | RESEND_API_KEY、RESEND_AUDIENCE_ID |
| newsletter / Beehiiv | BEEHIIV_API_KEY、BEEHIIV_PUBLICATION_ID |
| payment | STRIPE_SECRET_KEY、STRIPE_WEBHOOK_SECRET、至少一个非空 allowedPriceIds |
| notification | 至少一个 DISCORD_WEBHOOK_URL 或 FEISHU_WEBHOOK_URL |
| analytics | 至少一个选中 provider，且每个选中 provider 的 ID / domain 完整；Umami 额外要求 VITE_UMAMI_SCRIPT_URL |

CLI 无法验证 binding 实体，只报告 Cloudflare EMAIL 的部署核对项。运行时使用实际 binding 存在性决定完整性。CLI 不把这种人工核对项冒充已验证，也不因无法读取云端 binding 而拒绝所有 Cloudflare 配置。

在请求入口调用 `parseServerEnv`，合并归一化结果与原始资源 bindings 后供注册表使用。只有校验后的字符串可以构造 provider。缺少可选字段不令营销首页失败；非法已填写字段是配置错误，诊断不回显值。

本子项目的门禁只保证关闭与缺失配置时不会调用业务；已配置服务的实际成功、失败、双语内容、授权与 SDK 契约仍由相应子项目修复和验收。

## 7. 配置检查与 sitemap

扩展现有开发与生产检查，复用同一个状态函数：

- 开发：非法字段失败；已启用但不完整的服务输出不含值的诊断，允许公共页面开发。
- 生产：真实 HTTPS `VITE_BASE_URL` 必填，拒绝 localhost、loopback、`.example`、`.test`、`example.com/.net/.org` 及其子域；已启用服务的缺失字段失败。
- 原有 production auth secret 要求保留，认证契约在第二子项目统一。
- `.env` 不存在时允许完整的进程环境用于 CI；进程 env 优先。缺失必需字段由 schema / 生产规则具体报告。
- 输出逐模块状态及部署核对项，配置检查不发起网络请求。

sitemap 去掉关闭模块的静态与动态路径，保留各内容语言与已发布筛选。修正目前动态博客 `/blog/...` 与真实 `/marketing/blog/...` 不一致的问题；文档继续使用 `contentSlug`。动态博客优先消费已存在 slug 字段；若只有 `_meta.path`，与该路由现有匹配语义一致。

## 8. 文件职责

新增实现文件：

- `src/config/navigation.ts`：菜单目标、联合类型、上下文与过滤。
- `src/config/navbar-config.ts`：Navbar 链接与 actions。
- `src/config/footer-config.ts`：Footer 分组。
- `src/config/social-config.ts`：平台映射、URL 与邮箱过滤。
- `src/config/service-status.ts`：纯配置诊断。
- `src/components/layout/MenuLink.tsx`：站内 / 站外链接。
- `src/components/layout/MenuItems.tsx`：递归渲染。
- `src/lib/module-access.ts`：页面开关检查。
- `src/lib/module-access.server.ts`：API 运行时门禁。

测试优先扩展现有文件；独立新增 `tests/unit/navigation.test.ts`、`tests/unit/service-status.test.ts`、`tests/unit/module-access.test.ts`、`tests/components/navigation.test.tsx` 与 `e2e/site-config.spec.ts`，覆盖独立契约。不新增 Sidebar / Avatar 空文件。

修改现有 website / env / Cloudflare 类型、Navbar / Footer / DocsLayout / ThemeToggle / home blocks / theme / server、指定页面与 API、Analytics 启用过滤、sitemap、check scripts、README 与上手文档。具体位置及 TDD 步骤见实施计划。

## 9. 验收

1. 同进程连续 zh → en → zh 调用菜单工厂，文案与 locale params 正确，未固定首次语言。
2. 不存在路由、缺动态 params、将内部链接当外链等在 TypeScript 检查中被拒绝。
3. 过滤按模块、登录、角色递归生效，空组与冗余分隔符消失，输入不被修改。
4. Navbar 桌面 / 移动菜单同源，键盘 group 操作、Escape / 焦点恢复正常。
5. 空社交配置不渲染占位，合法链接安全打开，无标签图标不出现。
6. Logo 使用指定原图，主题 cookie 与 SSR / hydration 一致，关闭按钮不改变已选主题。
7. 关闭或缺配置的 API 在业务调用前返回 404 / 503；Webhook 关闭开关后仍可处理合法存量事件。
8. sitemap 只包含开放、正确、可访问的真实路径。
9. 生产检查拒绝缺失 URL、HTTP、本地与保留域名；诊断不打印任何合成 secret；CI 无 `.env` 时可检查进程 env。
10. `pnpm check`、单元测试、组件测试、相关 Playwright、生产 build 与客户端 bundle 检查成功。无实际外部投递、收费、迁移或部署。

## 10. 参考

- https://docs.tanstarter.dev/config/website
- https://docs.tanstarter.dev/config/navbar
- https://docs.tanstarter.dev/config/footer
- https://docs.tanstarter.dev/config/sidebar
- https://docs.tanstarter.dev/config/avatar
- https://docs.tanstarter.dev/config/social
- https://tanstack.com/router/latest/docs/framework/react/api/router/linkOptions
- https://tanstack.com/router/latest/docs/framework/react/guide/type-utilities

## 11. 规格自检

已核对：第一子项目边界与后续服务闭环分开；无账户死链；生产检查只证明配置；Webhook 与新付款开关语义分开；开发与 CI 读取规则一致；新文件各有独立职责。数据库与认证实现的批准范围不从本规格推导，分别在后续子项目呈现具体设计。
