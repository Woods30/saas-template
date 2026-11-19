/**
 * 受保护区域的站内路由常量。
 *
 * 只有两处允许出现路径字面量：
 * - 路由文件里的 `createFileRoute(...)`——路由 id 与文件路径绑定，且含 pathless 的
 *   `_layout` 段，无法外部化；
 * - 本文件。
 *
 * 侧栏菜单、面包屑、用户菜单、页面 `seo()` 路径与测试断言一律引用这里，
 * 改路径时不必再全仓搜索。
 */

/** 管理台（`/admin/*`）。 */
export const adminRoutes = {
  overview: '/{-$locale}/admin',
  users: '/{-$locale}/admin/users',
  roles: '/{-$locale}/admin/roles',
  audit: '/{-$locale}/admin/audit',
  orders: '/{-$locale}/admin/orders',
  subscriptions: '/{-$locale}/admin/subscriptions',
  manualPayments: '/{-$locale}/admin/manual-payments',
  credits: '/{-$locale}/admin/credits',
  content: '/{-$locale}/admin/content',
  tickets: '/{-$locale}/admin/tickets',
  tasks: '/{-$locale}/admin/tasks',
  settings: '/{-$locale}/admin/settings',
} as const

/** 个人中心（`/settings/*`）。 */
export const settingsRoutes = {
  profile: '/{-$locale}/settings/profile',
  security: '/{-$locale}/settings/security',
  sessions: '/{-$locale}/settings/sessions',
  notifications: '/{-$locale}/settings/notifications',
  billing: '/{-$locale}/settings/billing',
  manualPayments: '/{-$locale}/settings/manual-payments',
  manualPaymentDetail: '/{-$locale}/settings/manual-payments/$orderId',
  apiKeys: '/{-$locale}/settings/api-keys',
} as const

export type AdminRoute = (typeof adminRoutes)[keyof typeof adminRoutes]
export type SettingsRoute = (typeof settingsRoutes)[keyof typeof settingsRoutes]
export type AppRoute = AdminRoute | SettingsRoute

/** `to` 模板去掉可选 locale 段，得到 `seo()` / robots 使用的站内路径。 */
export function pathOf(to: AppRoute): string {
  return to.replace('/{-$locale}', '')
}

/**
 * `to` 模板相对布局根的路由段：`/zh/admin/users` → `users`，`/zh/admin` → `''`。
 *
 * 用于把当前 pathname 与菜单项对齐（高亮、面包屑末级）。
 */
export function sectionOf(to: AppRoute, base: 'admin' | 'settings'): string {
  return pathOf(to).slice(`/${base}/`.length)
}
