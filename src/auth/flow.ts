import { type WebsiteConfig, websiteConfig } from '@/config/website'

/**
 * 注册流程的两个派生判定。
 *
 * 它们本身只有一行，但**必须**与 `src/auth/auth.ts` 传给 better-auth 的选项保持一致：
 * 页面与服务端若各判各的，用户就会看到与实际状态矛盾的结果（最典型的是「明明已经登录，
 * 却被告知去查收验证邮件」）。放在这里是为了让页面能引用同一份定义，而不是复制条件。
 */

/**
 * 是否要求邮箱验证。与 `getAuth` 的 `emailAndPassword.requireEmailVerification` 同源。
 *
 * 读**显式配置**，不跟随 `mail.enabled`：邮箱验证是安全控制，不是邮件功能开关。
 * 早先按 `mail.enabled` 推导，导致「没配邮件」这一运维状态静默降级为
 * 「任何人都能拿别人的邮箱注册」——而邮箱在下游被当作身份依据
 * （Stripe `customerEmail`、`ADMIN_EMAILS` 白名单），这是可被利用的权限提升。
 *
 * 无邮件部署要放行必须显式设置 `auth.requireEmailVerification: false`——模板默认即是
 * 如此（默认未接邮件）。反过来，接上邮件后应把它改为 `true`：`true` + 邮件未配齐是
 * 矛盾配置，会被 `getServiceStatuses()` 报为 incomplete 并让 `check:env:prod` 失败。
 */
export function requiresEmailVerification(config: WebsiteConfig = websiteConfig): boolean {
  return config.auth.requireEmailVerification
}

/** 注册成功后的去向。 */
export type SignUpOutcome = 'signed_in' | 'awaiting_verification'

/**
 * 注册成功后的页面去向。
 *
 * `requireEmailVerification: false` 时 better-auth **会自动登录**新用户并下发会话
 * （见 `sign-up.mjs` 的 `shouldSkipAutoSignIn`），因此此时跳首页才是事实；只有在要求
 * 验证时，注册成功才不等于可登录，页面才应停在「请查收验证邮件」。
 */
export function signUpOutcome(config: WebsiteConfig = websiteConfig): SignUpOutcome {
  return requiresEmailVerification(config) ? 'awaiting_verification' : 'signed_in'
}
