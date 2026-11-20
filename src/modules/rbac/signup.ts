/**
 * 注册后置动作：默认 RBAC 角色 + 注册赠积分。
 *
 * 由 `src/server.ts` 在模块加载期调用 `registerSignupSideEffects()` 注册进
 * `core/auth/user-hooks`，实际执行发生在 better-auth 的
 * `databaseHooks.user.create.after`（见 `core/auth/auth.ts`）。
 *
 * 配置在**执行时**读取（`websiteConfig.users`），不是模块加载时快照——后台改完
 * 配置即时生效，单测也能逐例切换默认角色与赠积分。
 */
import { websiteConfig } from '@/config/website'
import { registerUserCreatedHook } from '@/core/auth/user-hooks'
import { grantCredits } from '@/modules/credits/service'
import { assignRolesToUser } from './service'

const SIGNUP_CREDITS_SOURCE = 'bonus' as const

let registered = false

/**
 * 注册注册后置钩子（幂等：重复调用只注册一次）。
 *
 * 动作：
 * 1. `users.defaultRole` 不是 `'user'` 时分配该 RBAC 角色；`'user'` 表示**不分配**
 *    任何角色，`users.role` 保持 `'user'`、`loadUserPermissions` 返回空数组。
 *    默认值取 `'user'` 而非 `viewer`：viewer 持有全部 `admin.*.read`，默认授予
 *    等于把管理台开给每个注册用户。
 * 2. `signupCredits.enabled && Number.isInteger(amount) && amount > 0` 时发放一次
 *    注册积分（`grantCredits` 对非正整数抛错，所以先在这里挡住小数 / 0 / 负数）。
 */
export function registerSignupSideEffects(): void {
  if (registered) return
  registered = true

  registerUserCreatedHook(async ({ db, user }) => {
    const { defaultRole, signupCredits } = websiteConfig.users

    // 两个动作各自 try/catch：分配角色失败不该连带吞掉赠积分（反之亦然）。
    // 失败只记日志——账号已落库，后置动作不该把注册接口打回错误。
    if (defaultRole !== 'user') {
      try {
        // 系统发起的注册动作，不经过 HTTP，因此直接用通配权限作为天花板。
        await assignRolesToUser(db, {
          actorPermissions: ['*'],
          targetUserId: user.id,
          assignments: [{ roleName: defaultRole }],
        })
      } catch (error) {
        console.warn('[auth] 注册默认角色分配失败:', error)
      }
    }

    // 正整数校验：小数 / 0 / 负数都在这里挡下，不放进 `grantCredits` 再被吞掉。
    if (
      signupCredits.enabled &&
      Number.isInteger(signupCredits.amount) &&
      signupCredits.amount > 0
    ) {
      try {
        const expiresAt =
          signupCredits.validDays > 0
            ? new Date(Date.now() + signupCredits.validDays * 86_400_000)
            : undefined
        await grantCredits(db, {
          userId: user.id,
          amount: signupCredits.amount,
          source: SIGNUP_CREDITS_SOURCE,
          idempotencyKey: `signup:${user.id}`,
          expiresAt,
        })
      } catch (error) {
        console.warn('[auth] 注册赠积分发放失败:', error)
      }
    }
  })
}
