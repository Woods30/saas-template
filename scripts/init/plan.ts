/**
 * init 的变更计划：**纯函数**，配置进、变更清单出。
 *
 * 为什么要把计划和执行拆开：真正容易出错的地方（品牌替换漏了、JSONC 注释被抹掉、
 * 重跑一次把值改坏）全在「改成什么」这一步。把它做成纯函数，才能在单测里直接断言
 * 目标内容，而不是跑完脚本再回头翻文件。
 *
 * 每个计划项携带一个 `transform`：读入当前内容、返回新内容。这样计划本身不依赖
 * 磁盘，执行时才读文件，幂等性也由「新内容 === 当前内容」自然得到。
 */

import { basename } from 'node:path'
import { setJsoncValue } from '../lib/jsonc-edit'
import { replaceBrandInManifest, replaceBrandInMessages } from './replacements'

/**
 * 内容模块：`website.ts` 里形如 `docs: { enabled: boolean }` 的开关。
 *
 * 模板出厂时这些模块大多是开的，但它们各自要求对应的 env 与外部服务 ——
 * 一个什么都不配的克隆者因此跑不通生产校验。init 默认全关，由开发者按需打开。
 */
export const MODULE_NAMES = [
  'docs',
  'blog',
  'changelog',
  'mail',
  'contact',
  'newsletter',
  'payment',
  'collection',
  'notification',
  'analytics',
  'auth',
] as const

export type ModuleName = (typeof MODULE_NAMES)[number]

/** 能力开关：`website.ts` 里形如 `enableApiKeys: boolean` 的扁平标志。 */
export const FEATURE_NAMES = [
  'enableI18n',
  'enableFileUpload',
  'enableApiKeys',
  'enableAdmin',
  'enableAIGateway',
] as const

export type FeatureName = (typeof FEATURE_NAMES)[number]

/** 一次初始化所需的全部输入。 */
export interface InitConfig {
  /** 站点展示名，如 `Acme`。 */
  name: string
  /** 小写短名：Cloudflare 资源前缀与包名。 */
  slug: string
  /** 生产域名，如 `acme.dev`。 */
  domain: string
  /** 支持邮箱。 */
  email: string
  /** 要**开启**的内容模块；不在列表里的一律关闭。 */
  modules: ModuleName[]
  /** 要**开启**的能力开关；缺省全关。 */
  features?: FeatureName[]
}

/** 计划里的一个文件变更。 */
export interface PlannedFile {
  /** 仓库内相对路径。 */
  path: string
  /** 一句话说明，供 `--dry-run` 与失败提示展示。 */
  description: string
  /** 纯变换：当前内容 → 新内容。 */
  transform: (current: string) => string
}

export interface InitPlan {
  files: PlannedFile[]
}

/** 资源 ID 是账号相关的，init 无从得知；留占位符交给部署流程回填。 */
const PLACEHOLDER = 'REPLACE_ME'

/**
 * 从配置生成变更清单。
 *
 * 顺序固定（包名 → 文案 → 站点配置 → 商品配置 → 部署配置），`--dry-run` 的输出因此可预期。
 */
export function buildPlan(config: InitConfig): InitPlan {
  return {
    files: [
      {
        path: 'package.json',
        description: `包名改为 ${config.slug}`,
        transform: (current) => setJsonField(current, 'name', config.slug),
      },
      {
        path: 'messages/zh.json',
        description: `中文文案里的品牌名改为 ${config.name}`,
        transform: (current) =>
          replaceBrandInMessages(current, { brand: config.name, locale: 'zh' }),
      },
      {
        path: 'messages/en.json',
        description: `英文文案里的品牌名改为 ${config.name}`,
        transform: (current) =>
          replaceBrandInMessages(current, { brand: config.name, locale: 'en' }),
      },
      {
        path: 'public/manifest.json',
        description: `PWA 站点名改为 ${config.name}`,
        transform: (current) => replaceBrandInManifest(current, config.name),
      },
      {
        path: 'src/config/website.ts',
        description: `站点名改为 ${config.name}，模块开关按选择重设，支持邮箱改为 ${config.email}`,
        transform: (current) =>
          applyAll(current, [
            (source) => replaceConfigLiteral(source, 'name', config.name),
            (source) => replaceConfigLiteral(source, 'logoAccent', ''),
            (source) => replaceConfigLiteral(source, 'supportEmail', config.email),
            (source) => clearDocsSiteUrl(source),
            ...MODULE_NAMES.map(
              (module) => (source: string) =>
                setModuleEnabled(source, module, config.modules.includes(module)),
            ),
            // 选了收款码链路就把结账模式切过去：两条链路互斥，模块开着却不切换
            // 仍然是走托管支付，使用者会以为没生效。
            (source: string) =>
              setCheckoutMode(
                source,
                config.modules.includes('collection') ? 'collection' : 'provider',
              ),
            ...FEATURE_NAMES.map(
              (feature) => (source: string) =>
                setFeatureEnabled(source, feature, (config.features ?? []).includes(feature)),
            ),
          ]),
      },
      {
        path: 'src/config/products.ts',
        description: `一次性商品的显示名改为 ${config.name}`,
        transform: (current) =>
          replaceConfigLiteral(current, 'name', config.name, '一次性商品的显示名'),
      },
      {
        path: 'wrangler.jsonc',
        description: `Worker 名改为 ${config.slug}，域名改为 ${config.domain}，资源 ID 置为占位符`,
        transform: (current) =>
          applyAll(current, [
            (source) => setJsoncValue(source, ['name'], config.slug),
            (source) => setJsoncValue(source, ['routes', 0, 'pattern'], config.domain),
            (source) =>
              setJsoncValue(source, ['d1_databases', 0, 'database_name'], `${config.slug}-db`),
            (source) => setJsoncValue(source, ['d1_databases', 0, 'database_id'], PLACEHOLDER),
            (source) => setJsoncValue(source, ['kv_namespaces', 0, 'id'], PLACEHOLDER),
          ]),
      },
    ],
  }
}

/** 依次套用若干变换；顺序即书写顺序。 */
function applyAll(source: string, steps: Array<(input: string) => string>): string {
  return steps.reduce((current, step) => step(current), source)
}

/**
 * 把源码里 `key: 'value'` 的值换掉，**要求全文件恰好匹配一处**。
 *
 * 匹配数不是 1 就抛错：0 处说明配置项的写法变了（静默跳过等于什么都没做），
 * 多处说明 key 名撞了（改错地方比不改更糟）。
 *
 * `what` 只是错误信息里的称呼，便于同一段代码改不同的配置项时说清楚是哪一项。
 */
export function replaceConfigLiteral(
  source: string,
  key: string,
  value: string,
  what = `配置项 ${key}`,
): string {
  if (value.includes("'")) {
    throw new Error(`${what} 的新值含单引号，无法写入单引号字符串：${value}`)
  }

  const pattern = new RegExp(`(\\b${key}: )'[^']*'`, 'g')
  const matches = source.match(pattern) ?? []
  if (matches.length !== 1) {
    throw new Error(`${what} 在源码里匹配到 ${matches.length} 处，期望恰好 1 处`)
  }

  return source.replace(pattern, `$1'${value}'`)
}

/**
 * 改某个内容模块的 `enabled`。
 *
 * 匹配 `模块名: { ... enabled: <bool>`，允许对象跨行（`payment` 中间有注释）。
 * 这些模块的对象字面量里没有嵌套的 `{}`，因此 `[^}]*?` 不会越过模块边界。
 */
export function setModuleEnabled(source: string, module: ModuleName, enabled: boolean): string {
  const pattern = new RegExp(`(\\b${module}: \\{[^}]*?enabled: )(true|false)`)
  if (!pattern.test(source)) throw new Error(`配置里找不到模块 ${module} 的 enabled 开关`)
  return source.replace(pattern, `$1${enabled}`)
}

/**
 * 改写结账模式。
 *
 * 只认 `checkout: { mode: '...' }` 这一处配置值：类型声明里的 `mode` 也可能出现，
 * 但它不带引号，不匹配。
 */
export function setCheckoutMode(source: string, mode: 'provider' | 'collection'): string {
  const pattern = /(\bcheckout: \{[^}]*?mode: )'(provider|collection)'/
  if (!pattern.test(source)) throw new Error('配置里找不到结账模式 checkout.mode')
  return source.replace(pattern, `$1'${mode}'`)
}

/**
 * 清掉外部文档站地址。
 *
 * `docs.siteUrl` 指向的是**原来那个站**的文档站。新项目要么自己提供文档，
 * 要么把地址改掉 —— 留着旧地址等于把访客送到别人的文档站。
 */
export function clearDocsSiteUrl(source: string): string {
  // 只认配置值：类型声明里的 `docs: {` 也在同一文件里，
  // 但它没有 `enabled: true|false`，因此不匹配。
  const pattern = /(\bdocs: \{)([^}]*?enabled: (?:true|false)[^}]*)(\})/
  return source.replace(pattern, (_all, head: string, body: string, tail: string) => {
    const cleaned = body.replace(/,?\s*siteUrl:\s*'[^']*'/, '').replace(/,\s*$/, '')
    return `${head}${cleaned}${tail}`
  })
}

/** 改某个能力开关。 */
export function setFeatureEnabled(source: string, feature: FeatureName, enabled: boolean): string {
  const pattern = new RegExp(`(\\b${feature}: )(true|false)`)
  if (!pattern.test(source)) throw new Error(`配置里找不到能力开关 ${feature}`)
  return source.replace(pattern, `$1${enabled}`)
}

/** 改 JSON 文件的顶层字段，按 2 空格缩进写回（与仓库既有格式一致）。 */
function setJsonField(source: string, key: string, value: unknown): string {
  const parsed = JSON.parse(source) as Record<string, unknown>
  if (!Object.hasOwn(parsed, key)) throw new Error(`JSON 里没有字段 ${key}`)
  parsed[key] = value
  return `${JSON.stringify(parsed, null, 2)}\n`
}

/** 站名 → 小写短名。推不出合法短名时抛错，而不是产出一个 `acme--` 之类的资源名。 */
export function deriveSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    throw new Error(`无法从「${name}」推导出合法的 slug，请用 --slug 显式指定`)
  }
  return slug
}

/**
 * 补全默认值。
 *
 * 默认值必须让「一路回车」也能跑：站名取目录名，域名用保留域名占位，
 * 邮箱跟随域名。真实域名由开发者稍后改。
 */
export function resolveConfig(args: Partial<InitConfig>, cwd: string): InitConfig {
  const name = args.name ?? basename(cwd)
  const slug = args.slug ?? deriveSlug(name)
  const domain = args.domain ?? `${slug}.example.com`
  return {
    name,
    slug,
    domain,
    email: args.email ?? `support@${domain}`,
    modules: args.modules ?? [],
    features: args.features,
  }
}

/** 计划的可读摘要，供 `--dry-run` 打印。 */
export function describePlan(plan: InitPlan): string[] {
  return plan.files.map((file) => `${file.path} — ${file.description}`)
}
