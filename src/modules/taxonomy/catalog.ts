export type TaxonomyType = 'category' | 'tag'

export interface TaxonomySeed {
  type: TaxonomyType
  slug: string
  name: string
  description: string
  sortOrder: number
}

export const DEFAULT_TAXONOMIES: readonly TaxonomySeed[] = [
  {
    type: 'category',
    slug: 'announcement',
    name: '产品公告',
    description: '版本发布、功能上线与站点动态',
    sortOrder: 10,
  },
  {
    type: 'category',
    slug: 'engineering',
    name: '工程实践',
    description: '架构演进、多方言数据库与边缘部署实践',
    sortOrder: 20,
  },
  {
    type: 'category',
    slug: 'guides',
    name: '使用指南',
    description: '计费、权限与 AI 网关接入教程',
    sortOrder: 30,
  },
  {
    type: 'tag',
    slug: 'ai',
    name: 'AI',
    description: 'AI 网关与异步生成任务',
    sortOrder: 10,
  },
  {
    type: 'tag',
    slug: 'billing',
    name: '计费',
    description: '积分账本、用量与套餐权益',
    sortOrder: 20,
  },
] as const

export function taxonomyIdOf(type: TaxonomyType, slug: string): string {
  return `tax:${type}:${slug}`
}
