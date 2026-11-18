/**
 * 权益目录与套餐的出厂默认值。
 *
 * 这份数据是**种子**，不是运行时事实源：`pnpm db:seed` 把它写进数据库，
 * 之后后台改了什么就以数据库为准。放在模块里而不是种子脚本里，是因为
 * 「有哪些权益、有哪些套餐」属于 entitlements 模块的领域概念，脚本只是搬运工。
 *
 * 不依赖 i18n：种子脚本不跑 locale 编译，读不到编译期消息。名称用模板的
 * 基准语言（中文）；后台改了以后数据库说了算。
 */
import type { EntitlementPeriod, EntitlementType } from './types'

/** 权益目录里的一项。 */
export interface EntitlementSeed {
  key: string
  name: string
  type: EntitlementType
  /** quota 类型的默认额度；null 表示不限量。boolean 类型忽略。 */
  defaultLimit: number | null
  period: EntitlementPeriod
  description: string | null
  sortOrder: number
}

/** 套餐给某项权益的额度。 */
export interface PlanEntitlementSeed {
  entitlementKey: string
  /** 该套餐下的额度；null 表示沿用目录默认值。 */
  limitValue: number | null
  enabled: boolean
}

/** 套餐。 */
export interface PlanSeed {
  key: string
  name: string
  description: string | null
  /** 关联代码里的商品（`src/config/products.ts` 的 productId / offerId）。 */
  productId: string | null
  offerId: string | null
  active: boolean
  sortOrder: number
  entitlements: PlanEntitlementSeed[]
}

/**
 * 权益目录。
 *
 * 默认额度一律保守（拿不到额度就等于不能用）：没有套餐的用户只能拿到
 * `team_members` 的 1 个席位，其余额度为 0。套餐负责把额度放开。
 */
export const DEFAULT_ENTITLEMENTS: EntitlementSeed[] = [
  {
    key: 'api_access',
    name: 'API 调用',
    type: 'boolean',
    defaultLimit: null,
    period: 'none',
    description: '允许用 API key 调用产品接口',
    sortOrder: 10,
  },
  {
    key: 'ai_tasks',
    name: 'AI 任务数',
    type: 'quota',
    defaultLimit: 0,
    period: 'month',
    description: '每月可提交的 AI 任务数量',
    sortOrder: 20,
  },
  {
    key: 'api_keys',
    name: 'API Key 数量',
    type: 'quota',
    defaultLimit: 0,
    period: 'none',
    description: '可同时有效的 API key 数量',
    sortOrder: 30,
  },
  {
    key: 'team_members',
    name: '团队成员数',
    type: 'quota',
    defaultLimit: 1,
    period: 'none',
    description: '可加入的团队成员数量',
    sortOrder: 40,
  },
  {
    key: 'priority_support',
    name: '优先支持',
    type: 'boolean',
    defaultLimit: null,
    period: 'none',
    description: '工单进入优先处理队列',
    sortOrder: 50,
  },
]

/**
 * 套餐。
 *
 * `productId` / `offerId` 指向 `src/config/products.ts` 里的商品与付费方式：
 * 订阅生效时按这两项匹配到套餐，再把套餐里的权益授予用户。`offerId` 为空的
 * 套餐（比如免费版）只能由后台手动开通——没有任何购买动作能匹配到它。
 */
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    key: 'free',
    name: '免费版',
    description: '基础额度，适合试用',
    productId: 'free',
    offerId: null,
    active: true,
    sortOrder: 10,
    entitlements: [
      { entitlementKey: 'api_access', limitValue: null, enabled: false },
      { entitlementKey: 'ai_tasks', limitValue: 10, enabled: true },
      { entitlementKey: 'api_keys', limitValue: 1, enabled: true },
      { entitlementKey: 'team_members', limitValue: 1, enabled: true },
      { entitlementKey: 'priority_support', limitValue: null, enabled: false },
    ],
  },
  {
    key: 'pro_monthly',
    name: '专业版（月付）',
    description: '按月订阅，按月重置额度',
    productId: 'pro',
    offerId: 'monthly',
    active: true,
    sortOrder: 20,
    entitlements: [
      { entitlementKey: 'api_access', limitValue: null, enabled: true },
      { entitlementKey: 'ai_tasks', limitValue: 1000, enabled: true },
      { entitlementKey: 'api_keys', limitValue: 10, enabled: true },
      { entitlementKey: 'team_members', limitValue: 10, enabled: true },
      { entitlementKey: 'priority_support', limitValue: null, enabled: true },
    ],
  },
  {
    key: 'pro_yearly',
    name: '专业版（年付）',
    description: '按年订阅，额度按月重置',
    productId: 'pro',
    offerId: 'yearly',
    active: true,
    sortOrder: 30,
    entitlements: [
      { entitlementKey: 'api_access', limitValue: null, enabled: true },
      { entitlementKey: 'ai_tasks', limitValue: 1000, enabled: true },
      { entitlementKey: 'api_keys', limitValue: 10, enabled: true },
      { entitlementKey: 'team_members', limitValue: 10, enabled: true },
      { entitlementKey: 'priority_support', limitValue: null, enabled: true },
    ],
  },
  {
    key: 'lifetime',
    name: '买断版',
    description: '一次付费，长期可用',
    productId: 'lifetime',
    offerId: 'once',
    active: true,
    sortOrder: 40,
    entitlements: [
      { entitlementKey: 'api_access', limitValue: null, enabled: true },
      { entitlementKey: 'ai_tasks', limitValue: 10000, enabled: true },
      { entitlementKey: 'api_keys', limitValue: 50, enabled: true },
      { entitlementKey: 'team_members', limitValue: 50, enabled: true },
      { entitlementKey: 'priority_support', limitValue: null, enabled: true },
    ],
  },
  {
    key: 'template',
    name: '模板买断',
    description: '核销型支付买断后的套餐',
    productId: 'template',
    offerId: 'once',
    active: true,
    sortOrder: 50,
    entitlements: [
      { entitlementKey: 'api_access', limitValue: null, enabled: true },
      { entitlementKey: 'ai_tasks', limitValue: 1000, enabled: true },
      { entitlementKey: 'api_keys', limitValue: 10, enabled: true },
      { entitlementKey: 'team_members', limitValue: 10, enabled: true },
      { entitlementKey: 'priority_support', limitValue: null, enabled: true },
    ],
  },
]
