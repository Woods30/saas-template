import { type WebsiteConfig, websiteConfig } from '@/config/website'

/**
 * 注册流程的派生判定。
 *
 * **必须**与 `src/core/auth/auth.ts` 传给 better-auth 的选项保持一致：页面与服务端各判各的，
 * 用户会看到与实际状态矛盾的结果。放这里是为了让页面引用同一份定义。
 */

/**
 * 是否要求邮箱验证。与 `getAuth` 的 `emailAndPassword.requireEmailVerification` 同源。
 *
 * 读**显式配置**，不跟随 `mail.enabled`：邮箱是下游的身份依据（Stripe `customerEmail`、
 * `ADMIN_EMAILS`），按邮件开关推导会让「没配邮件」静默变成可冒用他人邮箱。
 */
export function requiresEmailVerification(config: WebsiteConfig = websiteConfig): boolean {
  return config.auth.requireEmailVerification
}

/**
 * 是否发送验证邮件。注册、登录重发与手动重发共用此判定。
 *
 * 不能只看 `mail.enabled`：邮件模块开着不等于要验证邮箱，没要求验证时发信只会
 * 让用户收到一封点不点都无所谓的邮件。也不能只看 `requireEmailVerification`：
 * 邮件模块关闭时 better-auth 仍会调用发送回调，只是必然失败并刷日志。
 */
export function sendsVerificationEmail(config: WebsiteConfig = websiteConfig): boolean {
  return requiresEmailVerification(config) && config.mail.enabled
}

/**
 * 是否启用邮箱 + 密码登录。与 `getAuth` 的 `emailAndPassword.enabled` 同源。
 *
 * 登录 / 注册页据此隐藏邮箱表单；关闭后页面只保留社交登录。
 */
export function emailPasswordEnabled(config: WebsiteConfig = websiteConfig): boolean {
  return config.auth.emailEnabled
}

/** 注册成功后的去向。 */
export type SignUpOutcome = 'signed_in' | 'awaiting_verification'

/**
 * 注册成功后的页面去向。
 *
 * `requireEmailVerification: false` 时 better-auth 会自动登录新用户并下发会话
 * （`sign-up.mjs` 的 `shouldSkipAutoSignIn`），因此此时跳首页才是事实。
 */
export function signUpOutcome(config: WebsiteConfig = websiteConfig): SignUpOutcome {
  return requiresEmailVerification(config) ? 'awaiting_verification' : 'signed_in'
}
