import {
  IconActivity,
  IconArchive,
  IconBell,
  type IconBook,
  IconBrandCloudflare,
  IconChartBar,
  IconCloud,
  IconCreditCard,
  IconDatabase,
  IconFileText,
  IconFolder,
  IconForms,
  IconKey,
  IconMail,
  IconPalette,
  IconPlugConnected,
  IconRocket,
  IconSettings,
  IconSitemap,
  IconTestPipe,
  IconUser,
  IconUsers,
} from '@tabler/icons-react'

/**
 * 文档 slug → 图标。
 *
 * 侧边栏与搜索弹窗共用同一份映射：同一篇文档在两个位置必须显示同一枚图标，
 * 否则用户在搜索结果里会认不出侧栏里见过的那一项。未列出的 slug 回退到
 * `DOC_FALLBACK_ICON`。
 */
export const DOC_ICON: Record<string, typeof IconBook> = {
  'getting-started': IconRocket,
  configuration: IconSettings,
  navigation: IconSitemap,
  environment: IconActivity,
  integrations: IconPlugConnected,
  email: IconMail,
  newsletter: IconFileText,
  payment: IconCreditCard,
  notifications: IconBell,
  analytics: IconChartBar,
  cloudflare: IconBrandCloudflare,
  database: IconDatabase,
  storage: IconArchive,
  cache: IconCloud,
  'api-keys': IconKey,
  'user-management': IconUsers,
  'auth-account': IconUser,
  'project-structure': IconFolder,
  'design-system': IconPalette,
  forms: IconForms,
  testing: IconTestPipe,
}

/** 未在 {@link DOC_ICON} 中登记时的通用文档图标。 */
export const DOC_FALLBACK_ICON = IconFileText
