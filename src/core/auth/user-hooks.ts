/**
 * 注册后置钩子的注册表（纯逻辑，不读 env / 请求上下文）。
 *
 * better-auth 的 `databaseHooks.user.create.after` 只负责调用 `runUserCreatedHooks`；
 * 「注册后要做哪些事」由业务模块注册进来——这样 `core/auth` 不必反向依赖
 * `modules/rbac` / `modules/credits`。当前唯一的注册方是 `modules/rbac/signup`。
 *
 * 顶层只 import `DB` 的类型（运行时擦除），不把 drizzle 牵进来：本模块与
 * `rbac.ts` 一样要能在客户端/脚本的安全图里被静态引用。
 */
import type { DB } from '@/core/db'

export type UserCreatedHook = (ctx: {
  db: DB
  user: { id: string; email: string }
}) => Promise<void>

const hooks: UserCreatedHook[] = []

/** 注册一个钩子。按引用去重：同一函数重复注册只保留一次。 */
export function registerUserCreatedHook(hook: UserCreatedHook): void {
  if (hooks.includes(hook)) return
  hooks.push(hook)
}

/**
 * 依次执行所有已注册钩子。
 *
 * 每个钩子独立 try/catch：注册已经成功落库，后置动作失败不该把注册接口打回错误，
 * 否则用户会看到「注册失败」却已有一个账号。失败只记日志，交由运维排查重试。
 */
export async function runUserCreatedHooks(ctx: {
  db: DB
  user: { id: string; email: string }
}): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook(ctx)
    } catch (error) {
      console.warn('[auth] 注册后置钩子失败:', error)
    }
  }
}
