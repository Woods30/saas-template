import {
  IconActivity,
  IconBell,
  type IconBook,
  IconChartBar,
  IconCreditCard,
  IconFileText,
  IconMail,
  IconPlugConnected,
  IconRocket,
  IconSettings,
  IconSitemap,
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
}

/** 未在 {@link DOC_ICON} 中登记时的通用文档图标。 */
export const DOC_FALLBACK_ICON = IconFileText
