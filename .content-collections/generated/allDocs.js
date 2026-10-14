
export default [
  {
    "title": "Analytics",
    "description": "Enabling GA / Plausible / Umami / Clarity and script injection",
    "locale": "en",
    "order": 10,
    "group": "features",
    "updated": "2026-10-14",
    "content": "| Provider | Required config |\n|---|---|\n| `ga` | `VITE_GA_ID` |\n| `plausible` | `VITE_PLAUSIBLE_DOMAIN` |\n| `umami` | `VITE_UMAMI_WEBSITE_ID` (or the legacy `VITE_UMAMI_ID`) + `VITE_UMAMI_SCRIPT_URL` |\n| `clarity` | `VITE_CLARITY_PROJECT_ID` (or the legacy `VITE_CLARITY_ID`) |\n\n`initAnalytics()` registers the selected adapters only in the browser and only when `analytics.enabled` is `true`.\n\n```ts\nanalytics: { enabled: true, providers: ['ga', 'plausible'] },\n```\n\n> **Note**: A provider that is selected but missing its ID is neither registered nor script-injected; `track()` / `page()` are no-ops with no provider. Umami additionally requires a credential-free HTTPS script URL. This module only handles enable-filtering and script injection — it does **not** mean the collection endpoint is reachable.\n\n## Next steps\n\n- [Email](./email) — transactional mail and the contact form\n- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules",
    "_meta": {
      "filePath": "analytics.md",
      "fileName": "analytics.md",
      "directory": ".",
      "extension": "md",
      "path": "analytics"
    }
  },
  {
    "title": "分析",
    "description": "GA / Plausible / Umami / Clarity 的启用与脚本注入",
    "locale": "zh",
    "order": 10,
    "group": "features",
    "updated": "2026-10-14",
    "content": "| provider | 必要配置 |\n|---|---|\n| `ga` | `VITE_GA_ID` |\n| `plausible` | `VITE_PLAUSIBLE_DOMAIN` |\n| `umami` | `VITE_UMAMI_WEBSITE_ID`（或兼容字段 `VITE_UMAMI_ID`）+ `VITE_UMAMI_SCRIPT_URL` |\n| `clarity` | `VITE_CLARITY_PROJECT_ID`（或兼容字段 `VITE_CLARITY_ID`） |\n\n`initAnalytics()` 只在浏览器环境且 `analytics.enabled` 为 `true` 时注册配置中选中的适配器。\n\n```ts\nanalytics: { enabled: true, providers: ['ga', 'plausible'] },\n```\n\n> **注意事项**：选中但缺少 ID 的 provider 不注册也不注入脚本；`track()` / `page()` 在无 provider 时为空操作。Umami 额外要求脚本地址为无凭据的 HTTPS URL。本模块只负责启用过滤与脚本注入，**不**代表采集端点已可用。\n\n## 下一步\n\n- [邮件](./email)——事务邮件与联系表单的投递\n- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点",
    "_meta": {
      "filePath": "analytics.zh.md",
      "fileName": "analytics.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "analytics.zh"
    }
  },
  {
    "title": "Website Config",
    "description": "Every websiteConfig field, its default, and switch semantics",
    "locale": "en",
    "order": 2,
    "group": "config",
    "updated": "2026-10-14",
    "content": "All site configuration lives in `src/config/website.ts`, which exports the `websiteConfig` object.\n\n```ts\n// src/config/website.ts\nimport { type PublicEnv, publicEnv } from '@/env/public'\n\nexport const websiteConfig = createWebsiteConfig(publicEnv)\n```\n\nThe factory `createWebsiteConfig(env)` takes public env explicitly, so scripts and unit tests can build an independent config without relying on the module singleton.\n\n> **Notes**\n> - Language-independent values only. The config is evaluated once at module load; copy that varies by request language must call `m.*()` inside a component render or a route `head()`.\n> - Public values only. The type only accepts `PublicEnv`, so a secret cannot reach the client bundle through it.\n\n## Metadata\n\nImage paths must be root-relative (`/logo.svg`) or protocol-relative (`//cdn/logo.svg`), or `pnpm check` reports an error.\n\n| Field | Type | Description |\n|---|---|---|\n| `metadata.name` | `string` | Site name for JSON-LD, mail sender display name, and manifest |\n| `metadata.images.ogImage` | `string` | Open Graph image; `seo()` expands it to an absolute URL |\n| `metadata.images.logoLight` | `string` | Logo used in light theme |\n| `metadata.images.logoDark` | `string` | Logo used in dark theme |\n| `metadata.images.icon` | `string` | Favicon and PWA icon |\n\n## UI\n\n| Field | Type | Default | Description |\n|---|---|---|---|\n| `ui.defaultTheme` | `'light' \\| 'dark' \\| 'system'` | `'system'` | Theme when no `THEME` cookie is present |\n| `ui.enableThemeSwitch` | `boolean` | `true` | Hide the theme toggle when `false` |\n\n`ui.defaultTheme` is read by both SSR and the client, so the first paint does not flicker.\n\n## Site base URL\n\n| Field | Type | Description |\n|---|---|---|\n| `baseUrl` | `string` | Comes from `VITE_BASE_URL`; used for canonical, OG, sitemap, robots |\n\n> Production must be a real HTTPS domain. `pnpm check:env:prod` rejects `localhost`, loopback addresses, `0.0.0.0`, URLs with embedded credentials, and reserved domains such as `example.com` / `.net` / `.org`.\n\n## Content modules\n\n`docs` / `blog` / `changelog` are **on** by default. When off, the pages return 404, drop out of the sitemap, and their menu items stop rendering.\n\n| Field | Type | Default | Description |\n|---|---|---|---|\n| `docs.enabled` | `boolean` | `true` | Docs site (`/docs`) |\n| `blog.enabled` | `boolean` | `true` | Blog (`/marketing/blog`) |\n| `changelog.enabled` | `boolean` | `true` | Changelog (`/marketing/changelog`) |\n\n## Service modules\n\nThe six service modules are **off** by default. Fill in the required config before enabling, or the status is `incomplete` and the API returns 503.\n\n| Field | Type | Default | Required config |\n|---|---|---|---|\n| `mail.enabled` | `boolean` | `false` | See [Email](./integrations#email) |\n| `mail.provider` | `'resend' \\| 'cloudflare'` | `'resend'` | — |\n| `mail.supportEmail` | `string` | `''` | A valid email address |\n| `contact.enabled` | `boolean` | `false` | Requires `mail` to be fully configured |\n| `newsletter.enabled` | `boolean` | `false` | See [Newsletter](./integrations#newsletter) |\n| `newsletter.provider` | `'resend' \\| 'beehiiv'` | `'resend'` | — |\n| `payment.enabled` | `boolean` | `false` | See [Payment](./integrations#payment) |\n| `payment.provider` | `'stripe'` | `'stripe'` | Stripe only for now |\n| `payment.allowedPriceIds` | `string[]` | `[]` | At least one non-empty Price ID |\n| `notification.enabled` | `boolean` | `false` | A Discord or Feishu webhook |\n| `analytics.enabled` | `boolean` | `false` | See [Analytics](./integrations#analytics) |\n| `analytics.providers` | `AnalyticsName[]` | `[]` | The ID for each selected provider |\n\n## Social media\n\n`social` is `Partial<Record<SocialPlatform, string>>`. Platforms you do not configure render no placeholder at all.\n\nSupported: `github`, `x`, `bluesky`, `mastodon`, `discord`, `youtube`, `linkedin`, `facebook`, `instagram`, `tiktok`, `telegram`.\n\n```ts\nsocial: {\n  github: 'https://github.com/your-org/your-project',\n  x: 'https://x.com/your-handle',\n},\n```\n\n> Links must be **credential-free HTTPS URLs**. Items that fail are skipped silently and reported by `pnpm check` as field names (never raw values). When `mail.supportEmail` is valid, the footer also renders a `mailto:` entry.\n\n## Feature flags\n\n| Field | Type | Default | Description |\n|---|---|---|---|\n| `features.enableI18n` | `boolean` | `true` | Internationalization |\n| `features.enableFileUpload` | `boolean` | `false` | File upload (depends on the storage module) |\n| `features.enableApiKeys` | `boolean` | `false` | API key management |\n| `features.enableAdmin` | `boolean` | `false` | Admin dashboard |\n| `features.enableAIGateway` | `boolean` | `false` | AI gateway |\n\nThese flags only mark capability boundaries for your business code to check; they do not register routes.\n\n## Full example\n\n```ts\n// src/config/website.ts\nexport function createWebsiteConfig(env: PublicEnv): WebsiteConfig {\n  return {\n    baseUrl: env.VITE_BASE_URL,\n    metadata: {\n      name: 'Jerbix',\n      images: {\n        ogImage: '/logo.png',\n        logoLight: '/logo-horizontal-transparent.svg',\n        logoDark: '/logo-horizontal-transparent.svg',\n        icon: '/icon-jerboa.svg',\n      },\n    },\n    ui: { defaultTheme: 'system', enableThemeSwitch: true },\n    docs: { enabled: true },\n    blog: { enabled: true },\n    changelog: { enabled: true },\n    mail: { enabled: false, provider: 'resend', supportEmail: '' },\n    contact: { enabled: false },\n    newsletter: { enabled: false, provider: 'resend' },\n    payment: { enabled: false, provider: 'stripe', allowedPriceIds: [] },\n    notification: { enabled: false },\n    analytics: { enabled: false, providers: [] },\n    social: {},\n    features: {\n      enableI18n: true,\n      enableFileUpload: false,\n      enableApiKeys: false,\n      enableAdmin: false,\n      enableAIGateway: false,\n    },\n  }\n}\n```\n\n## Validating the config\n\n`getServiceStatuses()` in `src/config/service-status.ts` is a pure function that returns one of three states per module:\n\n| State | Meaning |\n|---|---|\n| `disabled` | The module switch is `false` |\n| `incomplete` | Enabled but missing required fields; `issues` lists field names and locations |\n| `configured` | Switch and required fields are complete |\n\n> `configured` means **the config is complete only**. It does not mean an external service is ready, mail was delivered, or a payment succeeded. Diagnostics contain field names, reasons, and locations — never credential values.\n\n## Next steps\n\n- [Navigation & Menus](./navigation) — how menus filter by module switch\n- [Integrations](./integrations) — each service module's provider and wiring\n- [Environment Variables](./environment) — the two-layer env check and the `VITE_` rule",
    "_meta": {
      "filePath": "configuration.md",
      "fileName": "configuration.md",
      "directory": ".",
      "extension": "md",
      "path": "configuration"
    }
  },
  {
    "title": "网站配置",
    "description": "websiteConfig 的全部字段、默认值与开关语义",
    "locale": "zh",
    "order": 2,
    "group": "config",
    "updated": "2026-10-14",
    "content": "站点配置的唯一入口是 `src/config/website.ts`，导出 `websiteConfig` 对象。\n\n```ts\n// src/config/website.ts\nimport { type PublicEnv, publicEnv } from '@/env/public'\n\nexport const websiteConfig = createWebsiteConfig(publicEnv)\n```\n\n工厂 `createWebsiteConfig(env)` 显式接收公开 env，脚本与单测可传入独立配置，不必依赖全局单例。\n\n> **注意事项**\n> - 只放**语言无关**值。配置在模块加载期求值一次；随请求语言变化的文案必须在组件 render 或路由 `head()` 内调用 `m.*()`。\n> - 只放**公开**值。类型签名只接受 `PublicEnv`，secret 无法经此进入客户端 bundle。\n\n## 元数据\n\n图片路径必须为 root-relative（`/logo.svg`）或 protocol-relative（`//cdn/logo.svg`），否则 `pnpm check` 会报错。\n\n| 字段 | 类型 | 说明 |\n|---|---|---|\n| `metadata.name` | `string` | 站点名称，用于 JSON-LD、邮件发件人显示名、manifest |\n| `metadata.images.ogImage` | `string` | Open Graph 分享图，由 `seo()` 补全为绝对 URL |\n| `metadata.images.logoLight` | `string` | 浅色主题下的 Logo |\n| `metadata.images.logoDark` | `string` | 深色主题下的 Logo |\n| `metadata.images.icon` | `string` | favicon 与 PWA 图标 |\n\n## UI\n\n| 字段 | 类型 | 默认值 | 说明 |\n|---|---|---|---|\n| `ui.defaultTheme` | `'light' \\| 'dark' \\| 'system'` | `'system'` | 无 `THEME` cookie 时的主题 |\n| `ui.enableThemeSwitch` | `boolean` | `true` | 为 `false` 时隐藏主题切换按钮 |\n\n`ui.defaultTheme` 同时用于 SSR 与客户端，保证首屏不闪烁。\n\n## 站点基址\n\n| 字段 | 类型 | 说明 |\n|---|---|---|\n| `baseUrl` | `string` | 取自 `VITE_BASE_URL`，用于 canonical、OG、sitemap、robots |\n\n> 生产环境必须是真实 HTTPS 域名。`pnpm check:env:prod` 会拒绝 `localhost`、回环地址、`0.0.0.0`、内嵌凭据的 URL，以及 `example.com` / `.net` / `.org` 等保留域名。\n\n## 内容模块\n\n`docs` / `blog` / `changelog` 默认**开启**。关闭后对应页面返回 404、从 sitemap 移除、相关菜单项不渲染。\n\n| 字段 | 类型 | 默认值 | 说明 |\n|---|---|---|---|\n| `docs.enabled` | `boolean` | `true` | 文档站（`/docs`） |\n| `blog.enabled` | `boolean` | `true` | 博客（`/marketing/blog`） |\n| `changelog.enabled` | `boolean` | `true` | 更新日志（`/marketing/changelog`） |\n\n## 服务模块\n\n六个服务模块默认**关闭**。开启前须补齐「必要配置」，否则状态为 `incomplete`，API 返回 503。\n\n| 字段 | 类型 | 默认值 | 必要配置 |\n|---|---|---|---|\n| `mail.enabled` | `boolean` | `false` | 见[邮件](./integrations#邮件) |\n| `mail.provider` | `'resend' \\| 'cloudflare'` | `'resend'` | — |\n| `mail.supportEmail` | `string` | `''` | 合法邮箱地址 |\n| `contact.enabled` | `boolean` | `false` | 依赖 `mail` 已配置完整 |\n| `newsletter.enabled` | `boolean` | `false` | 见[邮件订阅](./integrations#邮件订阅) |\n| `newsletter.provider` | `'resend' \\| 'beehiiv'` | `'resend'` | — |\n| `payment.enabled` | `boolean` | `false` | 见[支付](./integrations#支付) |\n| `payment.provider` | `'stripe'` | `'stripe'` | 当前仅支持 Stripe |\n| `payment.allowedPriceIds` | `string[]` | `[]` | 至少一个非空 Price ID |\n| `notification.enabled` | `boolean` | `false` | Discord 或飞书 Webhook |\n| `analytics.enabled` | `boolean` | `false` | 见[分析](./integrations#分析) |\n| `analytics.providers` | `AnalyticsName[]` | `[]` | 每个选中 provider 的 ID |\n\n## 社交媒体\n\n`social` 是 `Partial<Record<SocialPlatform, string>>`，未配置的平台不渲染任何占位。\n\n支持：`github`、`x`、`bluesky`、`mastodon`、`discord`、`youtube`、`linkedin`、`facebook`、`instagram`、`tiktok`、`telegram`。\n\n```ts\nsocial: {\n  github: 'https://github.com/your-org/your-project',\n  x: 'https://x.com/your-handle',\n},\n```\n\n> 链接必须为**无凭据的 HTTPS URL**。不满足的项被静默跳过，并由 `pnpm check` 报告字段名（不回显原值）。`mail.supportEmail` 合法时，页脚额外渲染 `mailto:` 入口。\n\n## 功能开关\n\n| 字段 | 类型 | 默认值 | 说明 |\n|---|---|---|---|\n| `features.enableI18n` | `boolean` | `true` | 多语言 |\n| `features.enableFileUpload` | `boolean` | `false` | 文件上传（依赖存储模块） |\n| `features.enableApiKeys` | `boolean` | `false` | API 密钥管理 |\n| `features.enableAdmin` | `boolean` | `false` | 管理后台 |\n| `features.enableAIGateway` | `boolean` | `false` | AI 网关 |\n\n这些开关只标记能力边界，供业务代码判断可用性，本身不注册路由。\n\n## 完整示例\n\n```ts\n// src/config/website.ts\nexport function createWebsiteConfig(env: PublicEnv): WebsiteConfig {\n  return {\n    baseUrl: env.VITE_BASE_URL,\n    metadata: {\n      name: 'Jerbix',\n      images: {\n        ogImage: '/logo.png',\n        logoLight: '/logo-horizontal-transparent.svg',\n        logoDark: '/logo-horizontal-transparent.svg',\n        icon: '/icon-jerboa.svg',\n      },\n    },\n    ui: { defaultTheme: 'system', enableThemeSwitch: true },\n    docs: { enabled: true },\n    blog: { enabled: true },\n    changelog: { enabled: true },\n    mail: { enabled: false, provider: 'resend', supportEmail: '' },\n    contact: { enabled: false },\n    newsletter: { enabled: false, provider: 'resend' },\n    payment: { enabled: false, provider: 'stripe', allowedPriceIds: [] },\n    notification: { enabled: false },\n    analytics: { enabled: false, providers: [] },\n    social: {},\n    features: {\n      enableI18n: true,\n      enableFileUpload: false,\n      enableApiKeys: false,\n      enableAdmin: false,\n      enableAIGateway: false,\n    },\n  }\n}\n```\n\n## 校验配置\n\n`src/config/service-status.ts` 的 `getServiceStatuses()` 是纯函数，按模块返回三种状态：\n\n| 状态 | 含义 |\n|---|---|\n| `disabled` | 模块开关为 `false` |\n| `incomplete` | 已启用但缺少必要字段，`issues` 列出字段名与位置 |\n| `configured` | 开关与必要字段齐备 |\n\n> `configured` **只表示配置齐备**，不代表外部服务已就绪、邮件已投递或收款已成功。诊断输出只含字段名、原因与位置，绝不回显凭据值。\n\n## 下一步\n\n- [导航与菜单](./navigation)——菜单如何按模块开关过滤\n- [功能集成](./integrations)——各服务模块的 provider 与接线\n- [环境变量](./environment)——两层 env 校验与 `VITE_` 规则",
    "_meta": {
      "filePath": "configuration.zh.md",
      "fileName": "configuration.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "configuration.zh"
    }
  },
  {
    "title": "Email",
    "description": "Wiring Resend / Cloudflare Email and the contact form",
    "locale": "en",
    "order": 6,
    "group": "features",
    "updated": "2026-10-14",
    "content": "`src/mail/index.ts` looks up an instance by provider name from the current request's registry. `sendMail()` retries up to 3 times (250ms, increasing), and returns the last error if all attempts fail.\n\n| Provider | Required config |\n|---|---|\n| `resend` | `RESEND_API_KEY`, `MAIL_FROM` |\n| `cloudflare` | `MAIL_FROM` or `CLOUDFLARE_EMAIL_SENDER`, `EMAIL` binding |\n\nThe sender is normalized by `getMailFrom(config, env)`: `MAIL_FROM` first, then `CLOUDFLARE_EMAIL_SENDER` when the provider is Cloudflare. It does **not** fall back to `example.com` — without a sender the provider is not registered, so a call fails loudly instead of silently sending from the wrong address.\n\n```ts\nmail: { enabled: true, provider: 'resend', supportEmail: 'support@your-domain.com' },\n```\n\n> **Note**: The Cloudflare Email binding can only send to verified recipients. Check your account's limits before deploying; `pnpm check` lists this as a manual check but does not factor it into the completeness verdict. Beyond the gate, `/api/email` requires a valid session and the recipient must be in the `ADMIN_EMAILS` allowlist.\n\n## Contact form\n\n`contact` depends on `mail` being fully configured — when `contact.enabled` is `true` but `mail` is incomplete, the status is `incomplete` and `/api/contact` returns 503, so a submission is never left with nowhere to go.\n\nDelivery path (`src/contact/notifications.ts`):\n\n1. **Email** — the primary channel, sent to `mail.supportEmail`; failures log `console.warn`;\n2. **Discord** — only when `notification.enabled` is `true`; failures do not block the main flow.\n\n```ts\ncontact: { enabled: true },\n```\n\n## Next steps\n\n- [Newsletter](./newsletter) — one-click subscribe and unsubscribe\n- [Payment](./payment) — Stripe checkout and the Price allowlist",
    "_meta": {
      "filePath": "email.md",
      "fileName": "email.md",
      "directory": ".",
      "extension": "md",
      "path": "email"
    }
  },
  {
    "title": "邮件",
    "description": "Resend / Cloudflare Email 与联系表单的接线",
    "locale": "zh",
    "order": 6,
    "group": "features",
    "updated": "2026-10-14",
    "content": "`src/mail/index.ts` 按 provider 名称从当前请求的注册表取实例。`sendMail()` 带最多 3 次重试（间隔 250ms 递增），全部失败时返回最后一次错误。\n\n| provider | 必要配置 |\n|---|---|\n| `resend` | `RESEND_API_KEY`、`MAIL_FROM` |\n| `cloudflare` | `MAIL_FROM` 或 `CLOUDFLARE_EMAIL_SENDER`、`EMAIL` binding |\n\n发件人由 `getMailFrom(config, env)` 统一归一化：优先 `MAIL_FROM`；缺失且 provider 为 Cloudflare 时回退 `CLOUDFLARE_EMAIL_SENDER`。**不**回退 `example.com`——缺失时 provider 不注册，调用明确失败而非静默发出错误发件人的邮件。\n\n```ts\nmail: { enabled: true, provider: 'resend', supportEmail: 'support@your-domain.com' },\n```\n\n> **注意事项**：Cloudflare Email binding 只能发往已验证的收件地址。部署时须自行核对账户收件限制；`pnpm check` 会列为 manual 核对项，但不参与 completeness 判定。`/api/email` 除门禁外还要求有效会话，且收件人必须在 `ADMIN_EMAILS` 白名单内。\n\n## 联系表单\n\n`contact` 依赖 `mail` 配置完整——`contact.enabled` 为 `true` 但 `mail` 未配置齐备时，状态为 `incomplete`，`/api/contact` 返回 503，避免用户提交后消息无处投递。\n\n投递路径（`src/contact/notifications.ts`）：\n\n1. **邮件**——核心通道，发往 `mail.supportEmail`，失败写 `console.warn`；\n2. **Discord**——仅当 `notification.enabled` 为 `true`，失败不阻塞主流程。\n\n```ts\ncontact: { enabled: true },\n```\n\n## 下一步\n\n- [邮件订阅](./newsletter)——一键订阅与退订管理\n- [支付](./payment)——Stripe 结账与 Price 白名单",
    "_meta": {
      "filePath": "email.zh.md",
      "fileName": "email.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "email.zh"
    }
  },
  {
    "title": "Environment Variables",
    "description": "Two-layer env validation, the VITE_ rule, and production checks",
    "locale": "en",
    "order": 4,
    "group": "config",
    "updated": "2026-10-14",
    "content": "Environment variables come in two layers, validated by two Zod schemas:\n\n| File | Contents |\n|---|---|\n| `src/env/public.ts` | `VITE_` prefix, bundled into the client at build time |\n| `src/env/server.ts` | Server secrets, read only in the Workers runtime |\n\n```ts\n// src/env/public.ts\nexport const publicEnv: PublicEnv = parsePublicEnv(import.meta.env ?? {})\n\n// src/env/server.ts\nexport function parseServerEnv(raw: unknown): ServerEnv\n```\n\n> **Note**: Business code must **not** read `process.env` / `import.meta.env` directly — always go through these two modules' exports.\n\n`publicEnv` validates at module load, so an invalid `VITE_BASE_URL` throws in the importer rather than running with broken config. `parseServerEnv` runs **per request** — `src/server.ts` parses at the request entry, stores the result in AsyncLocalStorage, and exposes it as `getServerContext().env`.\n\n## The `VITE_` rule\n\n`VITE_` variables are inlined into the client bundle at build time, **visible to anyone who opens the page**.\n\n| Prefix | Meaning |\n|---|---|\n| `VITE_` | Public value (site URL, Stripe Price IDs, analytics IDs) |\n| none | Server secret, read only through Workers bindings |\n\n> **Note**: Never give a secret the `VITE_` prefix. `pnpm check:client-bundle` scans the build output to confirm nothing leaked.\n\n## Public variables\n\n| Variable | Type | Default | Description |\n|---|---|---|---|\n| `VITE_BASE_URL` | URL | `http://localhost:3000` | Site base for canonical, OG, sitemap, robots |\n| `VITE_PAYMENT_PROVIDER` | `'stripe'` | — | Payment provider |\n| `VITE_STRIPE_PRICE_PRO_MONTHLY` | `string` | — | Monthly subscription Price ID |\n| `VITE_STRIPE_PRICE_PRO_YEARLY` | `string` | — | Yearly subscription Price ID |\n| `VITE_STRIPE_PRICE_LIFETIME` | `string` | — | Lifetime Price ID |\n| `VITE_GA_ID` | `string` | — | Google Analytics measurement ID |\n| `VITE_PLAUSIBLE_DOMAIN` | `string` | — | Plausible domain |\n| `VITE_UMAMI_WEBSITE_ID` | `string` | — | Umami website ID |\n| `VITE_UMAMI_ID` | `string` | — | Umami website ID (legacy) |\n| `VITE_UMAMI_SCRIPT_URL` | URL | — | Umami script URL; must be a credential-free HTTPS URL |\n| `VITE_CLARITY_PROJECT_ID` | `string` | — | Microsoft Clarity project ID |\n| `VITE_CLARITY_ID` | `string` | — | Clarity project ID (legacy) |\n| `VITE_TURNSTILE_SITE_KEY` | `string` | — | Turnstile site key (its secret lives server-side) |\n\n## Server variables\n\nAll optional; when absent the matching provider is not registered rather than falling back to a placeholder.\n\n| Variable | Constraint | Description |\n|---|---|---|\n| `BETTER_AUTH_SECRET` | ≥ 32 chars | Auth secret; **required in production** |\n| `STRIPE_SECRET_KEY` | — | Stripe secret key |\n| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook signing secret |\n| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Google OAuth |\n| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | Cloudflare API |\n| `CLOUDFLARE_EMAIL_SENDER` | — | Cloudflare Email legacy sender field |\n| `RESEND_API_KEY` | — | Resend key |\n| `MAIL_FROM` | Valid email | Unified sender address |\n| `RESEND_AUDIENCE_ID` | — | Resend audience ID |\n| `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` | — | Beehiiv |\n| `BEEHIIV_SEND_WELCOME_EMAIL` | `'true'` / `'false'` | Default `'false'` |\n| `DISCORD_WEBHOOK_URL` | Must start with `https://discord.com/api/webhooks/` | Discord notifications |\n| `FEISHU_WEBHOOK_URL` | Must start with `https://open.feishu.cn/open-apis/bot/v2/hook/` | Feishu notifications |\n| `TURNSTILE_SECRET_KEY` | — | Turnstile server-side check |\n| `ADMIN_EMAILS` | — | `/api/email` recipient allowlist |\n| `NODE_ENV` | `development` / `production` / `test` | Default `development` |\n\nEmpty strings are normalized to `undefined` (see `treatEmptyAsUndefined` in `src/env/normalize.ts`), so a blank field in `.env` is the same as unset.\n\n## Workers bindings\n\nResource bindings do not go through the env schema; declare them in `wrangler.jsonc` and they arrive as request arguments:\n\n| Binding | Type | Purpose |\n|---|---|---|\n| `DB` | D1 | Drizzle database |\n| `CACHE` | KV | Cache and rate limiting |\n| `BUCKET` | R2 | Object storage |\n| `EMAIL` | SendEmail | Cloudflare Email sending |\n\n`src/types/cloudflare.d.ts` derives the string-binding types from `ServerEnv`, so a schema change propagates automatically.\n\n## Check commands\n\n| Command | Behavior |\n|---|---|\n| `pnpm check:env` | Validates the local `.env`; illegal fields fail, enabled-but-incomplete services print a value-free diagnostic |\n| `pnpm check:env:prod` | Production check: `VITE_BASE_URL` required and must be a real HTTPS domain; missing fields for enabled services fail outright |\n| `pnpm check:client-bundle` | Requires `pnpm build` first; confirms no server secret is in the client bundle |\n\nThe production URL check rejects: `localhost`, `*.localhost`, `::1`, `127.*`, `0.0.0.0`, URLs with embedded credentials, and `example.com` / `example.net` / `example.org` plus their subdomains, `*.example`, and `*.test`.\n\n```bash\n# CI: validate with process env when there is no .env\nBETTER_AUTH_SECRET=... VITE_BASE_URL=https://acme.dev pnpm check:env:prod\n```\n\n> **Note**: With no `.env` the check falls back to process env (CI), and process env takes precedence over the `.env` file. Diagnostics contain field names and reasons only — **never** a credential value.\n\n## Local setup\n\n```bash\ncp .env.example .env\npnpm check:env\n```\n\n`pnpm run setup` interactively creates D1 / R2 / KV resources, generates an auth secret, and writes `.env` and `wrangler.jsonc`.\n\n> **Note**: A local `.env` does **not** become production secrets — configure them separately with `wrangler secret put` before deploying.\n\n## Next steps\n\n- [Website Config](./configuration) — how module switches map to required config\n- [Integrations](./integrations) — the env fields each module needs\n- Deployment steps live in `docs/deployment.md` in the repo",
    "_meta": {
      "filePath": "environment.md",
      "fileName": "environment.md",
      "directory": ".",
      "extension": "md",
      "path": "environment"
    }
  },
  {
    "title": "环境变量",
    "description": "两层 env 校验、VITE_ 规则与生产检查",
    "locale": "zh",
    "order": 4,
    "group": "config",
    "updated": "2026-10-14",
    "content": "环境变量分两层，由两个 Zod schema 分别校验：\n\n| 文件 | 内容 |\n|---|---|\n| `src/env/public.ts` | `VITE_` 前缀，构建时进入客户端 bundle |\n| `src/env/server.ts` | 服务端 secret，只在 Workers 运行时读取 |\n\n```ts\n// src/env/public.ts\nexport const publicEnv: PublicEnv = parsePublicEnv(import.meta.env ?? {})\n\n// src/env/server.ts\nexport function parseServerEnv(raw: unknown): ServerEnv\n```\n\n> **注意事项**：业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经这两个模块的导出。\n\n`publicEnv` 在模块加载期即校验，非法的 `VITE_BASE_URL` 会让导入方直接抛错。`parseServerEnv` 则是**每请求**调用——`src/server.ts` 在请求入口解析后写入 AsyncLocalStorage，供 `getServerContext().env` 读取。\n\n## `VITE_` 规则\n\n`VITE_` 变量在构建时被内联进客户端 bundle，**任何人打开页面都能看到**。\n\n| 前缀 | 含义 |\n|---|---|\n| `VITE_` | 公开值（站点地址、Stripe Price ID、分析 ID 等） |\n| 无前缀 | 服务端 secret，只经 Workers binding 读取 |\n\n> **注意事项**：绝不能把 secret 设成 `VITE_` 前缀。`pnpm check:client-bundle` 会扫描构建产物确认无泄漏。\n\n## 公开变量\n\n| 变量 | 类型 | 默认值 | 说明 |\n|---|---|---|---|\n| `VITE_BASE_URL` | URL | `http://localhost:3000` | 站点基址，用于 canonical、OG、sitemap、robots |\n| `VITE_PAYMENT_PROVIDER` | `'stripe'` | — | 支付 provider |\n| `VITE_STRIPE_PRICE_PRO_MONTHLY` | `string` | — | 月度订阅 Price ID |\n| `VITE_STRIPE_PRICE_PRO_YEARLY` | `string` | — | 年度订阅 Price ID |\n| `VITE_STRIPE_PRICE_LIFETIME` | `string` | — | 买断 Price ID |\n| `VITE_GA_ID` | `string` | — | Google Analytics 衡量 ID |\n| `VITE_PLAUSIBLE_DOMAIN` | `string` | — | Plausible 统计域名 |\n| `VITE_UMAMI_WEBSITE_ID` | `string` | — | Umami 站点 ID |\n| `VITE_UMAMI_ID` | `string` | — | Umami 站点 ID（兼容字段） |\n| `VITE_UMAMI_SCRIPT_URL` | URL | — | Umami 脚本地址，须为无凭据 HTTPS URL |\n| `VITE_CLARITY_PROJECT_ID` | `string` | — | Microsoft Clarity 项目 ID |\n| `VITE_CLARITY_ID` | `string` | — | Clarity 项目 ID（兼容字段） |\n| `VITE_TURNSTILE_SITE_KEY` | `string` | — | Turnstile 站点 key（配套 secret 在服务端） |\n\n## 服务端变量\n\n全部可选；缺失时对应 provider 不注册，而非使用占位值。\n\n| 变量 | 约束 | 说明 |\n|---|---|---|\n| `BETTER_AUTH_SECRET` | ≥ 32 字符 | 认证密钥；**生产环境必填** |\n| `STRIPE_SECRET_KEY` | — | Stripe 密钥 |\n| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook 验签密钥 |\n| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Google OAuth |\n| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | Cloudflare API |\n| `CLOUDFLARE_EMAIL_SENDER` | — | Cloudflare Email 兼容发件人字段 |\n| `RESEND_API_KEY` | — | Resend 密钥 |\n| `MAIL_FROM` | 合法邮箱 | 统一发件地址 |\n| `RESEND_AUDIENCE_ID` | — | Resend 受众 ID |\n| `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` | — | Beehiiv |\n| `BEEHIIV_SEND_WELCOME_EMAIL` | `'true'` / `'false'` | 默认 `'false'` |\n| `DISCORD_WEBHOOK_URL` | 须以 `https://discord.com/api/webhooks/` 开头 | Discord 通知 |\n| `FEISHU_WEBHOOK_URL` | 须以 `https://open.feishu.cn/open-apis/bot/v2/hook/` 开头 | 飞书通知 |\n| `TURNSTILE_SECRET_KEY` | — | Turnstile 服务端校验 |\n| `ADMIN_EMAILS` | — | `/api/email` 收件人白名单 |\n| `NODE_ENV` | `development` / `production` / `test` | 默认 `development` |\n\n空字符串被归一化为 `undefined`（见 `src/env/normalize.ts` 的 `treatEmptyAsUndefined`），因此 `.env` 里留空的字段等同于未设置。\n\n## Workers binding\n\n资源 binding 不走 env schema，由 `wrangler.jsonc` 声明后经请求参数传入：\n\n| binding | 类型 | 用途 |\n|---|---|---|\n| `DB` | D1 | Drizzle 数据库 |\n| `CACHE` | KV | 缓存与限流 |\n| `BUCKET` | R2 | 对象存储 |\n| `EMAIL` | SendEmail | Cloudflare Email 发信 |\n\n`src/types/cloudflare.d.ts` 从 `ServerEnv` 派生字符串 binding 的类型，使 schema 变更时类型自动同步。\n\n## 检查命令\n\n| 命令 | 行为 |\n|---|---|\n| `pnpm check:env` | 校验本地 `.env`；非法字段失败，已启用但不完整的服务输出不含值的诊断 |\n| `pnpm check:env:prod` | 生产检查：`VITE_BASE_URL` 必填且必须是真实 HTTPS 域名；已启用服务的缺失字段直接失败 |\n| `pnpm check:client-bundle` | 需先 `pnpm build`；确认客户端 bundle 不含服务端 secret |\n\n生产 URL 检查会拒绝：`localhost`、`*.localhost`、`::1`、`127.*`、`0.0.0.0`、内嵌凭据的 URL，以及 `example.com` / `example.net` / `example.org` 及其子域、`*.example`、`*.test`。\n\n```bash\n# CI：无 .env 时用进程 env 校验\nBETTER_AUTH_SECRET=... VITE_BASE_URL=https://acme.dev pnpm check:env:prod\n```\n\n> **注意事项**：`.env` 不存在时回退到进程 env（CI 场景），且进程 env 优先于 `.env` 文件。诊断输出只含字段名与原因，**绝不**回显任何凭据值。\n\n## 本地设置\n\n```bash\ncp .env.example .env\npnpm check:env\n```\n\n`pnpm run setup` 会交互式创建 D1 / R2 / KV 资源、生成认证密钥并写入 `.env` 与 `wrangler.jsonc`。\n\n> **注意事项**：本地 `.env` **不会**自动成为生产环境的 secret——部署前须另行用 `wrangler secret put` 配置。\n\n## 下一步\n\n- [网站配置](./configuration)——模块开关与必要配置的对应关系\n- [功能集成](./integrations)——各模块所需的 env 字段\n- 部署步骤见仓库内 `docs/deployment.md`",
    "_meta": {
      "filePath": "environment.zh.md",
      "fileName": "environment.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "environment.zh"
    }
  },
  {
    "title": "Getting Started",
    "description": "Run Jerbix from scratch — environment, resources, and deploy checks",
    "locale": "en",
    "order": 1,
    "group": "start",
    "updated": "2026-10-14",
    "content": "## Prepare your environment\n\nYou need Node.js 22.12+ on an even-numbered LTS (22 or 24), pnpm, and a Cloudflare account.\n\n```bash\npnpm install\npnpm exec wrangler login\npnpm exec wrangler whoami\n```\n\n`wrangler login` opens a browser to authorize. Use `whoami` to confirm the account before continuing.\n\n## Provision resources\n\n```bash\npnpm run setup\n```\n\nThe script creates or looks up a D1 database, R2 bucket, and KV namespace, generates an auth secret, and writes local `.env` and `wrangler.jsonc`.\n\n> **Note**: The resources it creates belong to your Cloudflare account. Check existing configuration before running so you do not overwrite values you need to keep.\n\nStripe, email, and notification can be configured in the script or later. You must still fill in credentials for whichever modules you use before deploying.\n\n## Start local development\n\n```bash\npnpm dev\n```\n\nOpen `http://localhost:3000`. The database uses D1 (SQLite) with Drizzle. The script attempts local migrations; if that fails, retry manually:\n\n```bash\npnpm exec wrangler d1 migrations apply DB --local\n```\n\n## Customize the site\n\n| What to change | Where |\n|---|---|\n| Site name, logo, module switches | `src/config/website.ts` |\n| UI copy | `messages/zh.json`, `messages/en.json` |\n| Page routes | `src/routes/` |\n| Marketing blocks | `src/components/blocks/marketing/` |\n| Docs / blog content | `content/` |\n\nSee [Website Config](./configuration) for every configuration field.\n\n## Check and deploy\n\n```bash\npnpm check\npnpm test\npnpm exec vitest run --config vitest.components.config.ts\npnpm build\npnpm check:client-bundle\n```\n\n```bash\npnpm deploy\n```\n\n`pnpm deploy` runs the production env check, builds, verifies the client bundle, then runs `wrangler deploy`.\n\n> **Note**: A local `.env` does **not** become production secrets. Configure them separately with `wrangler secret put`, and never put secrets in `VITE_` variables — those are shipped to the browser bundle.\n\n## Next steps\n\n- [Website Config](./configuration) — every `websiteConfig` field and switch\n- [Navigation & Menus](./navigation) — navbar, footer, and docs sidebar\n- [Integrations](./integrations) — email, payment, newsletter, notifications, analytics\n- [Environment Variables](./environment) — the two-layer check and the `VITE_` rule",
    "_meta": {
      "filePath": "getting-started.md",
      "fileName": "getting-started.md",
      "directory": ".",
      "extension": "md",
      "path": "getting-started"
    }
  },
  {
    "title": "快速开始",
    "description": "从零跑起 Jerbix：环境准备、资源配置与部署检查",
    "locale": "zh",
    "order": 1,
    "group": "start",
    "updated": "2026-10-14",
    "content": "## 准备开发环境\n\n需要 Node.js 22.12+ 的偶数 LTS（22 或 24）、pnpm，以及一个 Cloudflare 账号。\n\n```bash\npnpm install\npnpm exec wrangler login\npnpm exec wrangler whoami\n```\n\n`wrangler login` 会打开浏览器完成授权；用 `whoami` 确认当前账号正确后再继续。\n\n## 配置资源\n\n```bash\npnpm run setup\n```\n\n脚本会创建或查找 D1 数据库、R2 bucket、KV namespace，生成认证密钥，并写入本地 `.env` 与 `wrangler.jsonc`。\n\n> 脚本创建的资源属于你的 Cloudflare 账号。运行前先检查现有配置，避免覆盖需要保留的值。\n\nStripe、邮件、通知等可选服务可以在脚本中配置，也可以稍后补。部署前仍需按所用模块补齐凭据。\n\n## 启动本地开发\n\n```bash\npnpm dev\n```\n\n打开 `http://localhost:3000`。数据库使用 D1（SQLite）与 Drizzle，脚本会尝试执行本地迁移；若未成功可手动重试：\n\n```bash\npnpm exec wrangler d1 migrations apply DB --local\n```\n\n## 修改站点\n\n| 要改什么 | 改哪里 |\n|---|---|\n| 站点名称、Logo、模块开关 | `src/config/website.ts` |\n| 界面文案 | `messages/zh.json`、`messages/en.json` |\n| 页面路由 | `src/routes/` |\n| 营销区块 | `src/components/blocks/marketing/` |\n| 文档 / 博客内容 | `content/` |\n\n配置字段的完整说明见[网站配置](./configuration)。\n\n## 检查与部署\n\n```bash\npnpm check\npnpm test\npnpm exec vitest run --config vitest.components.config.ts\npnpm build\npnpm check:client-bundle\n```\n\n```bash\npnpm deploy\n```\n\n`pnpm deploy` 会依次做生产 env 校验、构建、客户端 bundle 检查，最后执行 `wrangler deploy`。\n\n> 本地 `.env` **不会**自动成为生产环境的 secret。部署前须另行用 `wrangler secret put` 配置，且**不得**把 secret 放进 `VITE_` 变量——它们会进入浏览器 bundle。\n\n## 下一步\n\n- [网站配置](./configuration)——`websiteConfig` 全字段与开关语义\n- [导航与菜单](./navigation)——Navbar、页脚、文档侧边栏\n- [功能集成](./integrations)——邮件、支付、订阅、通知、分析\n- [环境变量](./environment)——两层校验与 `VITE_` 规则",
    "_meta": {
      "filePath": "getting-started.zh.md",
      "fileName": "getting-started.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "getting-started.zh"
    }
  },
  {
    "title": "Integrations Overview",
    "description": "Gate semantics, endpoints, and wiring for the six service modules",
    "locale": "en",
    "order": 5,
    "group": "features",
    "updated": "2026-10-14",
    "content": "The six service modules (`mail` / `contact` / `newsletter` / `payment` / `notification` / `analytics`) are all off by default. Wiring a module has three parts:\n\n1. **Switch** — `enabled` in `src/config/website.ts`;\n2. **Provider registry** — `src/{mail,newsletter,notification,payment}/index.ts`, built per request in `src/server.ts` and stored in AsyncLocalStorage;\n3. **Runtime gate** — `src/lib/module-access.server.ts`, enforced at the very front of the API handler.\n\n## Gate semantics\n\n`getModuleUnavailableResponse(module)` must run before body parsing, auth, rate limiting, and provider calls.\n\n| Condition | Response |\n|---|---|\n| Module `enabled` is `false` | `404 { \"error\": \"MODULE_DISABLED\" }` |\n| Enabled but required config missing | `503 { \"error\": \"SERVICE_UNAVAILABLE\" }` |\n| Config complete | `undefined`; the caller continues |\n\nThe response carries only a stable error code — never the missing field or a credential.\n\n| Endpoint | Method | Module |\n|---|---|---|\n| `/api/contact/*` | `POST` | `contact` |\n| `/api/newsletter/*` | `POST` / `DELETE` | `newsletter` |\n| `/api/payment/*` | `POST` / `DELETE` | `payment` |\n| `/api/email/*` | `POST` | `mail` |\n\n> **Note**: The Stripe webhook (`/api/webhooks/stripe`) is **not** gated by `payment.enabled`, so existing subscriptions keep processing valid events after the module is turned off.\n\n## Per-module docs\n\n| Module | Doc |\n|---|---|\n| Email (with contact form) | [Email](./email) |\n| Newsletter | [Newsletter](./newsletter) |\n| Payment | [Payment](./payment) |\n| Notifications | [Notifications](./notifications) |\n| Analytics | [Analytics](./analytics) |\n\n## Config status diagnostics\n\n`getServiceStatuses({ config, publicEnv, serverEnv, bindings })` is a pure function: no network calls, no env reads, no credential echo. It returns `disabled` / `incomplete` / `configured` per module.\n\n> **Note**: `configured` is **not** delivered / paid / collected — it only means the switch and required fields are complete. `pnpm check` prints per-module status and deploy checklists; `pnpm check:env:prod` fails outright when an enabled module is missing a field.",
    "_meta": {
      "filePath": "integrations.md",
      "fileName": "integrations.md",
      "directory": ".",
      "extension": "md",
      "path": "integrations"
    }
  },
  {
    "title": "功能集成概览",
    "description": "六个服务模块的门禁语义、端点与接线方式",
    "locale": "zh",
    "order": 5,
    "group": "features",
    "updated": "2026-10-14",
    "content": "六个服务模块（`mail` / `contact` / `newsletter` / `payment` / `notification` / `analytics`）默认全部关闭。每个模块的接线由三部分组成：\n\n1. **开关**——`src/config/website.ts` 里的 `enabled`；\n2. **provider 注册表**——`src/{mail,newsletter,notification,payment}/index.ts`，在 `src/server.ts` 的请求入口按当前 env 构建，存入 AsyncLocalStorage；\n3. **运行时门禁**——`src/lib/module-access.server.ts`，在 API 处理的最前处拦截。\n\n## 门禁语义\n\n`getModuleUnavailableResponse(module)` 必须早于 body 解析、鉴权、限流与 provider 调用。\n\n| 条件 | 响应 |\n|---|---|\n| 模块 `enabled` 为 `false` | `404 { \"error\": \"MODULE_DISABLED\" }` |\n| 已启用但必要配置缺失 | `503 { \"error\": \"SERVICE_UNAVAILABLE\" }` |\n| 配置齐备 | `undefined`，调用方继续原有流程 |\n\n响应只含稳定错误码，不回显缺失字段或凭据。\n\n| 端点 | 方法 | 模块 |\n|---|---|---|\n| `/api/contact/*` | `POST` | `contact` |\n| `/api/newsletter/*` | `POST` / `DELETE` | `newsletter` |\n| `/api/payment/*` | `POST` / `DELETE` | `payment` |\n| `/api/email/*` | `POST` | `mail` |\n\n> **注意事项**：Stripe webhook（`/api/webhooks/stripe`）**不受** `payment.enabled` 门禁，以便模块关闭后仍能处理存量订阅的合法事件。\n\n## 各模块文档\n\n| 模块 | 文档 |\n|---|---|\n| 邮件（含联系表单） | [邮件](./email) |\n| 邮件订阅 | [邮件订阅](./newsletter) |\n| 支付 | [支付](./payment) |\n| 通知 | [通知](./notifications) |\n| 分析 | [分析](./analytics) |\n\n## 配置状态诊断\n\n`getServiceStatuses({ config, publicEnv, serverEnv, bindings })` 是纯函数，不发起网络请求、不读取 env、不回显凭据，返回逐模块的 `disabled` / `incomplete` / `configured`。\n\n> **注意事项**：`configured` **不等于** delivered / paid / collected——它只表示开关与必要字段齐备。`pnpm check` 会打印逐模块状态与部署核对项；`pnpm check:env:prod` 在已启用模块缺字段时直接失败。\n\n## 下一步\n\n- [网站配置](./configuration)——模块开关与默认值全表\n- [环境变量](./environment)——各模块所需的 env 字段与两层校验",
    "_meta": {
      "filePath": "integrations.zh.md",
      "fileName": "integrations.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "integrations.zh"
    }
  },
  {
    "title": "Navigation & Menus",
    "description": "Configure the navbar, footer, docs sidebar, and social links",
    "locale": "en",
    "order": 3,
    "group": "config",
    "updated": "2026-10-14",
    "content": "Every menu shares one data model and one set of render components, so filtering rules, external-link behavior, and keyboard handling are identical across the navbar, footer, and docs sidebar.\n\n| File | Responsibility |\n|---|---|\n| `src/config/navigation.ts` | Menu types, link targets, filtering rules |\n| `src/config/navbar-config.ts` | Navbar links and right-side actions |\n| `src/config/footer-config.ts` | Footer groups |\n| `src/config/social-config.ts` | Social platform map and safety filter |\n| `src/components/layout/MenuLink.tsx` | A single link (internal / external) |\n| `src/components/layout/MenuItems.tsx` | Recursive rendering (group / separator) |\n\n## Link targets\n\n`getPublicLinkOptions(target, locale, hash?)` maps a logical target to a type-safe `linkOptions()`. Internal links are validated by TanStack Router's `ValidateLinkOptions`: **a missing route, a missing dynamic param, or an internal link written as external is rejected by the TypeScript check**.\n\n| `target` | Resolves to |\n|---|---|\n| `home` | `/{locale}` (optionally with `hash`) |\n| `docs` | `/{locale}/docs` |\n| `blog` | `/{locale}/marketing/blog` |\n| `changelog` | `/{locale}/marketing/changelog` |\n| `pricing` | `/{locale}/pricing` |\n| `contact` | `/{locale}/contact` |\n| `login` | `/{locale}/auth/login` |\n| `terms` | `/{locale}/marketing/legal/terms` |\n| `privacy` | `/{locale}/marketing/legal/privacy` |\n\n## Menu item types\n\n`MenuItem` is a union of three shapes:\n\n| `kind` | Key field | Description |\n|---|---|---|\n| `link` | `destination` | Internal (`internal` + `options`) or external (`external` + `href` + `newTab`) |\n| `group` | `items` | Recursive children; the group disappears when all children are filtered out |\n| `separator` | — | Divider; leading, trailing, and consecutive duplicates are removed |\n\nAll three carry `id` (stable identifier), optional `title` / `description` / `icon`, and optional `visibility`.\n\n## Visibility filtering\n\nAll three `MenuVisibility` conditions must hold for an item to show:\n\n| Field | Type | Semantics |\n|---|---|---|\n| `module` | `SiteModule` | Shows when that module's `enabled` is `true` |\n| `authenticated` | `boolean` | Shows when it equals the current auth state |\n| `roles` | `readonly string[]` | Shows when signed in and the role is in the list |\n\n`filterMenuItems(items, ctx)` applies the rules recursively and **does not mutate its input**: it returns a new array, filtered groups leave no empty shell, and redundant `separator`s are cleaned up. Menu factories are pure functions; `MenuContext` is passed in with the current request's auth state, so processing zh → en back-to-back in one process still yields correct copy and locale params.\n\n```ts\nexport type MenuContext = { config: WebsiteConfig; authenticated: boolean; role?: string }\n```\n\n> **Note**: `roles: []` means \"never show\" (an empty list matches no role), which is asymmetric with the three-state `authenticated` semantics. The template has no caller today; keep this in mind when extending.\n\n## Navbar\n\n`getNavbarLinks(locale, ctx)` returns the main links; `getNavbarActions(locale, config)` returns the two right-side actions, `login` and `primary`.\n\nThe `primary` target follows config: when `docs.enabled` is `true` it points at the docs entry in the current language, otherwise it falls back to the `#features` anchor on the home page, so users are never sent to a removed page.\n\nDesktop and mobile render **the same data**, so the two can never disagree. Mobile supports the keyboard: `Enter` expands a group, `Escape` closes it, and focus returns to the trigger.\n\n## Docs sidebar\n\nThe docs sidebar does not use the menu model above. `src/lib/docs.ts` resolves `content/docs/` for the current language and passes the result to `DocsSidebar`.\n\nThe sidebar supports two levels: documents are grouped by the `group` frontmatter field, and the order of groups is decided by **the smallest `order` inside each group**, so there is no separate `groupOrder` field to keep in sync.\n\n| Frontmatter field | Purpose |\n|---|---|\n| `order` | Sorts within a group, and decides group order |\n| `group` | Group name; leave empty to list at the sidebar top level |\n\nDocs slugs are language-independent (see `contentSlug()`): both `getting-started.md` and `getting-started.zh.md` yield `getting-started`. So the URL stays stable across a language switch, and one URL hits the right translation in both languages instead of 404ing.\n\n## Social links\n\n`social-config.ts` maps the 11 platforms in `websiteConfig.social` to menu items with Tabler icons.\n\n- Unconfigured platforms render **no placeholder** and never produce an iconless entry;\n- Non-HTTPS or credential-bearing links are skipped and reported by `pnpm check` as field names;\n- External links set `newTab: true`, and `MenuLink` adds `rel=\"noopener noreferrer\"`;\n- When `mail.supportEmail` is a valid email, an extra `mailto:` support entry is rendered.\n\n## Next steps\n\n- [Website Config](./configuration) — how module switches affect menu visibility\n- [Integrations](./integrations) — how each service module is wired",
    "_meta": {
      "filePath": "navigation.md",
      "fileName": "navigation.md",
      "directory": ".",
      "extension": "md",
      "path": "navigation"
    }
  },
  {
    "title": "导航与菜单",
    "description": "配置 Navbar、页脚、文档侧边栏与社交链接",
    "locale": "zh",
    "order": 3,
    "group": "config",
    "updated": "2026-10-14",
    "content": "所有菜单共用同一套数据模型与渲染组件，因此过滤规则、外链行为与键盘操作在 Navbar、页脚、文档侧边栏中保持一致。\n\n| 文件 | 职责 |\n|---|---|\n| `src/config/navigation.ts` | 菜单类型、链接目标、过滤规则 |\n| `src/config/navbar-config.ts` | Navbar 链接与右侧 actions |\n| `src/config/footer-config.ts` | 页脚分组 |\n| `src/config/social-config.ts` | 社交平台映射与安全过滤 |\n| `src/components/layout/MenuLink.tsx` | 单个链接（站内 / 站外） |\n| `src/components/layout/MenuItems.tsx` | 递归渲染（group / separator） |\n\n## 链接目标\n\n`getPublicLinkOptions(target, locale, hash?)` 把逻辑目标映射为类型安全的 `linkOptions()`。内部链接经 TanStack Router 的 `ValidateLinkOptions` 校验：**路由不存在、缺动态 params、或把内部链接写成外链，都会在 TypeScript 检查中被拒绝**。\n\n| `target` | 解析结果 |\n|---|---|\n| `home` | `/{locale}`（可带 `hash`） |\n| `docs` | `/{locale}/docs` |\n| `blog` | `/{locale}/marketing/blog` |\n| `changelog` | `/{locale}/marketing/changelog` |\n| `pricing` | `/{locale}/pricing` |\n| `contact` | `/{locale}/contact` |\n| `login` | `/{locale}/auth/login` |\n| `terms` | `/{locale}/marketing/legal/terms` |\n| `privacy` | `/{locale}/marketing/legal/privacy` |\n\n## 菜单项类型\n\n`MenuItem` 是三种形状的联合：\n\n| `kind` | 关键字段 | 说明 |\n|---|---|---|\n| `link` | `destination` | 站内（`internal` + `options`）或站外（`external` + `href` + `newTab`） |\n| `group` | `items` | 递归子项；子项全被过滤时该组一并消失 |\n| `separator` | — | 分隔线；首尾与连续重复的会被自动移除 |\n\n三者都带 `id`（稳定标识）、可选 `title` / `description` / `icon`，以及可选的 `visibility`。\n\n## 可见性过滤\n\n`MenuVisibility` 的三个条件须全部满足才显示：\n\n| 字段 | 类型 | 语义 |\n|---|---|---|\n| `module` | `SiteModule` | 对应模块 `enabled` 为 `true` 时才显示 |\n| `authenticated` | `boolean` | 与当前登录状态相等时才显示 |\n| `roles` | `readonly string[]` | 已登录且角色在列表内时才显示 |\n\n`filterMenuItems(items, ctx)` 递归应用规则且**不修改输入**：返回新数组，被过滤的 group 不留空壳，冗余 `separator` 会被清理。菜单工厂是纯函数，`MenuContext` 由调用方传入当前请求的登录状态，因此同一进程连续处理 zh → en 时文案与 locale params 都正确。\n\n```ts\nexport type MenuContext = { config: WebsiteConfig; authenticated: boolean; role?: string }\n```\n\n> **注意事项**：`roles: []` 的语义是「永不显示」（空列表不匹配任何角色），与 `authenticated` 的三态语义并不对称。当前模板无调用方，扩展时请留意。\n\n## Navbar\n\n`getNavbarLinks(locale, ctx)` 返回主链接，`getNavbarActions(locale, config)` 返回右侧 `login` 与 `primary` 两个 action。\n\n`primary` 按钮的目标随配置变化：`docs.enabled` 为 `true` 时指向当前语言的文档入口，否则回退首页 `#features` 锚点，避免把用户导向已下线的页面。\n\n桌面菜单与移动端抽屉渲染**同一份**数据，不会出现两处不一致。移动端支持键盘操作：`Enter` 展开分组，`Escape` 关闭，焦点归还触发按钮。\n\n## 文档侧边栏\n\n文档侧边栏不使用上面的菜单模型，而是由 `src/lib/docs.ts` 按当前语言解析 `content/docs/` 后传给 `DocsSidebar`。\n\n侧边栏支持二级分组：文档按 frontmatter 的 `group` 聚合，组顺序由**组内最小的 `order`** 决定，因此无需额外维护 `groupOrder` 字段。\n\n| frontmatter 字段 | 作用 |\n|---|---|\n| `order` | 组内排序，同时决定组的先后 |\n| `group` | 分组名；留空则直接列在侧边栏顶层 |\n\n文档 slug 与语言无关（见 `contentSlug()`）：`getting-started.md` 与 `getting-started.zh.md` 都得到 `getting-started`。因此切换语言时 URL 保持稳定，同一 URL 在两种语言下都命中对应译文，不会 404。\n\n## 社交链接\n\n`social-config.ts` 把 `websiteConfig.social` 的 11 个平台映射为带 Tabler 图标的菜单项。\n\n- 未配置的平台**不渲染占位**，也不会出现没有图标的条目；\n- 非 HTTPS 或内嵌凭据的链接被跳过，并由 `pnpm check` 报告字段名；\n- 站外链接统一 `newTab: true`，由 `MenuLink` 加上 `rel=\"noopener noreferrer\"`；\n- `mail.supportEmail` 为合法邮箱时，额外渲染 `mailto:` 支持入口。\n\n## 下一步\n\n- [网站配置](./configuration)——模块开关如何影响菜单可见性\n- [功能集成](./integrations)——各服务模块的接线方式",
    "_meta": {
      "filePath": "navigation.zh.md",
      "fileName": "navigation.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "navigation.zh"
    }
  },
  {
    "title": "Newsletter",
    "description": "Wiring Resend / Beehiiv subscriptions and rate limits",
    "locale": "en",
    "order": 7,
    "group": "features",
    "updated": "2026-10-14",
    "content": "| Provider | Required config |\n|---|---|\n| `resend` | `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` |\n| `beehiiv` | `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID` |\n\n`BEEHIIV_SEND_WELCOME_EMAIL` controls whether Beehiiv sends a welcome email; `'true'` / `'false'`, default `'false'`.\n\nSubscription status is read through the KV cache (`CACHE_TTL.newsletterStatus`), and subscribe / unsubscribe invalidate the matching cache key.\n\n```ts\nnewsletter: { enabled: true, provider: 'resend' },\n```\n\n> **Note**: `/api/newsletter` has its own rate limit of 5 requests per IP per minute.\n\n## Next steps\n\n- [Payment](./payment) — Stripe checkout and the Price allowlist\n- [Analytics](./analytics) — enabling GA / Plausible / Umami / Clarity",
    "_meta": {
      "filePath": "newsletter.md",
      "fileName": "newsletter.md",
      "directory": ".",
      "extension": "md",
      "path": "newsletter"
    }
  },
  {
    "title": "邮件订阅",
    "description": "Resend / Beehiiv 订阅的接线与限流",
    "locale": "zh",
    "order": 7,
    "group": "features",
    "updated": "2026-10-14",
    "content": "| provider | 必要配置 |\n|---|---|\n| `resend` | `RESEND_API_KEY`、`RESEND_AUDIENCE_ID` |\n| `beehiiv` | `BEEHIIV_API_KEY`、`BEEHIIV_PUBLICATION_ID` |\n\n`BEEHIIV_SEND_WELCOME_EMAIL` 控制 Beehiiv 是否发送欢迎邮件，取值 `'true'` / `'false'`，默认 `'false'`。\n\n订阅状态查询经 KV 缓存（`CACHE_TTL.newsletterStatus`），订阅 / 退订后会主动失效对应缓存键。\n\n```ts\nnewsletter: { enabled: true, provider: 'resend' },\n```\n\n> **注意事项**：`/api/newsletter` 有独立限流，每 IP 每分钟 5 次。\n\n## 下一步\n\n- [支付](./payment)——Stripe 结账与 Price 白名单\n- [分析](./analytics)——GA / Plausible / Umami / Clarity 的启用",
    "_meta": {
      "filePath": "newsletter.zh.md",
      "fileName": "newsletter.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "newsletter.zh"
    }
  },
  {
    "title": "Notifications",
    "description": "Wiring Discord / Feishu webhooks",
    "locale": "en",
    "order": 9,
    "group": "features",
    "updated": "2026-10-14",
    "content": "| Provider | Required config |\n|---|---|\n| `discord` | `DISCORD_WEBHOOK_URL`, must start with `https://discord.com/api/webhooks/` |\n| `feishu` | `FEISHU_WEBHOOK_URL`, must start with `https://open.feishu.cn/open-apis/bot/v2/hook/` |\n\nThe URL prefix is enforced by the Zod schema.\n\n```ts\nnotification: { enabled: true },\n```\n\n> **Note**: When the provider is unregistered, delivery fails, or it throws, `notify()` only logs `console.warn` and returns `false` — a failed notification never blocks the business flow. Discord embeds are length-capped: titles truncate at 200 chars, bodies at 1000.\n\n## Next steps\n\n- [Analytics](./analytics) — enabling GA / Plausible / Umami / Clarity\n- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules",
    "_meta": {
      "filePath": "notifications.md",
      "fileName": "notifications.md",
      "directory": ".",
      "extension": "md",
      "path": "notifications"
    }
  },
  {
    "title": "通知",
    "description": "Discord / 飞书 Webhook 的接线",
    "locale": "zh",
    "order": 9,
    "group": "features",
    "updated": "2026-10-14",
    "content": "| provider | 必要配置 |\n|---|---|\n| `discord` | `DISCORD_WEBHOOK_URL`，须以 `https://discord.com/api/webhooks/` 开头 |\n| `feishu` | `FEISHU_WEBHOOK_URL`，须以 `https://open.feishu.cn/open-apis/bot/v2/hook/` 开头 |\n\nURL 前缀由 Zod schema 强制校验。\n\n```ts\nnotification: { enabled: true },\n```\n\n> **注意事项**：`notify()` 在 provider 未注册、投递失败或抛错时都只写 `console.warn` 并返回 `false`——通知失败**不**阻塞业务流程。Discord embed 有长度上限，标题截断至 200 字符、正文 1000 字符。\n\n## 下一步\n\n- [分析](./analytics)——GA / Plausible / Umami / Clarity 的启用\n- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点",
    "_meta": {
      "filePath": "notifications.zh.md",
      "fileName": "notifications.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "notifications.zh"
    }
  },
  {
    "title": "Payment",
    "description": "Stripe checkout, Price allowlist, and webhooks",
    "locale": "en",
    "order": 8,
    "group": "features",
    "updated": "2026-10-14",
    "content": "Only **Stripe** is supported today. The provider registers only when both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are present.\n\n`allowedPriceIds` is a server-side allowlist: when non-empty, `/api/payment` rejects a `priceId` not in the list; when empty, no allowlist check runs.\n\n```ts\npayment: {\n  enabled: true,\n  provider: 'stripe',\n  allowedPriceIds: [env.VITE_STRIPE_PRICE_PRO_MONTHLY ?? ''].filter(Boolean),\n},\n```\n\nCheckout (`POST /api/payment`): gate → session auth → rate limit (10 per IP per minute) → body validation → Price ID allowlist → create Checkout Session. Failures return 502.\n\n> **Note**: The webhook is idempotent and replay-safe — a failed signature returns 400 without writing; event IDs are deduped in the `webhook_events` table, so duplicates return 200; a business error returns 500 so Stripe retries. Fill in real Price IDs for production; the sample content does not mean your product has commercial plans configured.\n\n## Next steps\n\n- [Notifications](./notifications) — wiring Discord / Feishu webhooks\n- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules",
    "_meta": {
      "filePath": "payment.md",
      "fileName": "payment.md",
      "directory": ".",
      "extension": "md",
      "path": "payment"
    }
  },
  {
    "title": "支付",
    "description": "Stripe 结账、Price 白名单与 Webhook",
    "locale": "zh",
    "order": 8,
    "group": "features",
    "updated": "2026-10-14",
    "content": "当前仅支持 **Stripe**。provider 注册需要 `STRIPE_SECRET_KEY` 与 `STRIPE_WEBHOOK_SECRET` 同时存在，否则不注册。\n\n`allowedPriceIds` 是服务端白名单：非空时 `/api/payment` 拒绝不在列表内的 `priceId`；为空时不做白名单校验。\n\n```ts\npayment: {\n  enabled: true,\n  provider: 'stripe',\n  allowedPriceIds: [env.VITE_STRIPE_PRICE_PRO_MONTHLY ?? ''].filter(Boolean),\n},\n```\n\n结账流程（`POST /api/payment`）：门禁 → 会话鉴权 → 限流（每 IP 每分钟 10 次）→ body 校验 → Price ID 白名单 → 创建 Checkout Session。失败返回 502。\n\n> **注意事项**：Webhook 具备幂等与重投保护——验签失败返回 400 且不写库；事件 ID 经 `webhook_events` 表去重，重复事件直接返回 200；业务处理抛错返回 500 让 Stripe 重投。生产环境应填写实际 Price ID，示例内容不代表你的产品已配置商业套餐。\n\n## 下一步\n\n- [通知](./notifications)——Discord / 飞书 Webhook 的接线\n- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点",
    "_meta": {
      "filePath": "payment.zh.md",
      "fileName": "payment.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "payment.zh"
    }
  }
]