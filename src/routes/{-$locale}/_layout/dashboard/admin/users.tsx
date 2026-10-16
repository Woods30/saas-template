import { createFileRoute } from '@tanstack/react-router'
import { assertAdminRole, assertFeatureEnabled } from '@/lib/module-access'

/**
 * 用户管理页。
 *
 * 本文件先落地**路由与门禁**，列表 / 搜索 / 分页 / 角色 / 封禁 / 删除等 UI 由
 * Task 13 补全。之所以门禁先行：`src/config/settings.ts` 的侧栏项用
 * `linkOptions({ to: '/{-$locale}/dashboard/admin/users' })`，其 `to` 在 `tsc` 下
 * 必须匹配 `routeTree.gen.ts` 里已注册的路由——文件不存在时整个 `pnpm check` 报错，
 * 侧栏高亮也无从验证。
 *
 * 双重门禁：功能开关（`features.enableAdmin`）与角色（`role === 'admin'`）都满足才可进入；
 * 任一不满足抛 `notFound()`，以 404 呈现，不向非管理员泄漏该页存在。API 侧的开关门禁
 * 另在 `src/routes/api/auth/$.ts`。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/admin/users')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  component: AdminUsersPage,
})

function AdminUsersPage() {
  // Task 13 在此渲染用户列表。
  return null
}
