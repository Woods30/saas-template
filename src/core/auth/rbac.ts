/**
 * RBAC 权限匹配、天花板与出厂目录（纯函数与常量，不碰数据库，客户端与脚本均可安全导入）。
 *
 * 借鉴 ShipAny 的通配与天花板规则：
 * - `*` 匹配全部权限点；
 * - `admin.users.*` 匹配 `admin.users.` 前缀下的所有动作；
 * - 权限天花板（privilege ceiling）：任何操作者只能授予、修改或移除**自己已持有**的权限，
 *   防止只拿到 `admin.roles.write` 的管理员给自己或他人挂上 `*` 提权。
 */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const

export type BuiltinRoleName = (typeof ROLES)[keyof typeof ROLES]

export type RoleStatus = 'active' | 'disabled'

export interface PermissionSeed {
  code: string
  resource: string
  action: string
  title: string
  description: string
}

export interface BuiltinRoleSeed {
  name: string
  title: string
  description: string
  sortOrder: number
  permissions: readonly string[]
}

export const SYSTEM_ROLE_NAMES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.EDITOR,
  ROLES.VIEWER,
])

export const DEFAULT_PERMISSIONS: readonly PermissionSeed[] = [
  {
    code: '*',
    resource: '*',
    action: '*',
    title: '超级管理员通配权限',
    description: '拥有系统内全部后台与业务资源的完全控制权',
  },
  {
    code: 'admin.users.read',
    resource: 'admin.users',
    action: 'read',
    title: '查看用户',
    description: '查看用户列表、搜索账号与阅读资料',
  },
  {
    code: 'admin.users.write',
    resource: 'admin.users',
    action: 'write',
    title: '管理用户',
    description: '封禁/解封账号、修改角色与调整用户状态',
  },
  {
    code: 'admin.roles.read',
    resource: 'admin.roles',
    action: 'read',
    title: '查看角色与权限',
    description: '查看系统角色列表及绑定的权限矩阵',
  },
  {
    code: 'admin.roles.write',
    resource: 'admin.roles',
    action: 'write',
    title: '管理角色与权限',
    description: '创建/编辑自定义角色并分配自身权限范围内的权限点',
  },
  {
    code: 'admin.orders.read',
    resource: 'admin.orders',
    action: 'read',
    title: '查看订单与核销',
    description: '查看在线支付订单与线下扫码收款核销单',
  },
  {
    code: 'admin.orders.write',
    resource: 'admin.orders',
    action: 'write',
    title: '处理订单与收款核销',
    description: '通过或拒绝线下收款核销单、维护收款码账户',
  },
  {
    code: 'admin.subscriptions.read',
    resource: 'admin.subscriptions',
    action: 'read',
    title: '查看订阅',
    description: '查看全部用户的订阅周期与状态',
  },
  {
    code: 'admin.credits.read',
    resource: 'admin.credits',
    action: 'read',
    title: '查看积分账本',
    description: '查看用户积分余额、批次与消耗流水',
  },
  {
    code: 'admin.credits.write',
    resource: 'admin.credits',
    action: 'write',
    title: '发放与调整积分',
    description: '手工向指定用户发放补偿或奖励积分',
  },
  {
    code: 'admin.settings.read',
    resource: 'admin.settings',
    action: 'read',
    title: '查看系统设置',
    description: '读取站点品牌、SEO 与模块开关配置',
  },
  {
    code: 'admin.settings.write',
    resource: 'admin.settings',
    action: 'write',
    title: '修改系统设置',
    description: '保存站点品牌、SEO 与功能模块开关配置',
  },
  {
    code: 'admin.audit.read',
    resource: 'admin.audit',
    action: 'read',
    title: '查看审计日志',
    description: '检索后台敏感写操作与关键认证/支付审计轨迹',
  },
  {
    code: 'admin.tasks.read',
    resource: 'admin.tasks',
    action: 'read',
    title: '查看 AI 任务',
    description: '查看 AI 异步生成任务队列与积分预扣状态',
  },
  {
    code: 'admin.content.read',
    resource: 'admin.content',
    action: 'read',
    title: '查看内容与分类',
    description: '查看文章、更新日志与分类标签',
  },
  {
    code: 'admin.content.write',
    resource: 'admin.content',
    action: 'write',
    title: '管理内容与分类',
    description: '发布与编辑文章、更新日志及分类标签',
  },
  {
    code: 'admin.tickets.read',
    resource: 'admin.tickets',
    action: 'read',
    title: '查看工单',
    description: '查看用户提交的客服工单',
  },
  {
    code: 'admin.tickets.write',
    resource: 'admin.tickets',
    action: 'write',
    title: '回复与关闭工单',
    description: '处理并回复客服工单、更新工单状态',
  },
] as const

export const DEFAULT_ROLES: readonly BuiltinRoleSeed[] = [
  {
    name: ROLES.SUPER_ADMIN,
    title: '超级管理员',
    description: '内置最高权限角色，持有全局通配符 *',
    sortOrder: 10,
    permissions: ['*'],
  },
  {
    name: ROLES.ADMIN,
    title: '管理员',
    description: '负责日常用户、订单、积分、设置与审计运营（不含修改角色权限矩阵）',
    sortOrder: 20,
    permissions: DEFAULT_PERMISSIONS.map((p) => p.code).filter(
      (code) => code !== '*' && code !== 'admin.roles.write',
    ),
  },
  {
    name: ROLES.EDITOR,
    title: '内容与客服运营',
    description: '管理内容发布、分类标签与客服工单',
    sortOrder: 30,
    permissions: [
      'admin.content.read',
      'admin.content.write',
      'admin.tickets.read',
      'admin.tickets.write',
    ],
  },
  {
    name: ROLES.VIEWER,
    title: '只读审计员',
    description: '仅可浏览后台各项数据与审计日志，无任何写入权限',
    sortOrder: 40,
    permissions: DEFAULT_PERMISSIONS.map((p) => p.code).filter((code) => code.endsWith('.read')),
  },
] as const

/** 由权限码生成确定性的权限表主键。 */
export function permissionIdOf(code: string): string {
  return `perm_${code.replace(/[^a-zA-Z0-9_]/g, '_')}`
}

/** 由角色标识生成确定性的角色表主键。 */
export function roleIdOf(name: string): string {
  return `role_${name}`
}

/** 判断 `permissionCodes` 集合是否覆盖目标权限点 `permissionCode`（支持逐级 `.*` 与 `*`）。 */
export function matchPermission(
  permissionCode: string,
  permissionCodes: readonly string[],
): boolean {
  if (!permissionCode) return false
  if (permissionCodes.includes('*')) return true
  if (permissionCodes.includes(permissionCode)) return true

  // 若目标本身是前缀通配（如 `admin.users.*`），只有持有相同或更宽通配才算覆盖。
  const normalized = permissionCode.endsWith('.*') ? permissionCode.slice(0, -2) : permissionCode
  const parts = normalized.split('.')
  for (let i = parts.length - 1; i > 0; i--) {
    const wildcard = `${parts.slice(0, i).join('.')}.*`
    if (permissionCodes.includes(wildcard)) return true
  }
  return false
}

/** 任一目标权限被覆盖即返回 true。 */
export function matchAnyPermission(
  requiredCodes: readonly string[],
  userPermissionCodes: readonly string[],
): boolean {
  for (const code of requiredCodes) {
    if (matchPermission(code, userPermissionCodes)) return true
  }
  return false
}

/** 全部目标权限都被覆盖才返回 true。 */
export function matchAllPermissions(
  requiredCodes: readonly string[],
  userPermissionCodes: readonly string[],
): boolean {
  for (const code of requiredCodes) {
    if (!matchPermission(code, userPermissionCodes)) return false
  }
  return true
}

/** 判断权限码是否代表后台访问能力（`*` / `admin` / `admin.*`）。 */
export function isAdminPermission(code: string): boolean {
  return code === '*' || code === 'admin' || code.startsWith('admin.')
}

/**
 * 权限天花板检查：操作者涉及的所有目标权限码都必须在自己已持有的权限范围内。
 *
 * 返回第一个越界的权限码；全部在范围内时返回 `null`。
 */
export function findCeilingViolation(
  actorPermissions: readonly string[],
  targetPermissionCodes: readonly string[],
): string | null {
  for (const code of targetPermissionCodes) {
    if (!matchPermission(code, actorPermissions)) return code
  }
  return null
}
