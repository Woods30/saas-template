import { z } from 'zod'

/**
 * 认证表单的 Zod schema 工厂（纯函数）。
 *
 * 工厂**接收文案**而不是自己调 `m.*()`：校验逻辑因此不依赖 Paraglide 运行时，可单测。
 * 长度下限须与 better-auth 的 `minPasswordLength: 8` 一致。
 */

/** 与 `src/auth/auth.ts` 的 `emailAndPassword.minPasswordLength` 对应。 */
export const MIN_PASSWORD_LENGTH = 8

/** schema 需要的文案。传什么语言，错误消息就是什么语言。 */
export interface AuthFormMessages {
  required: string
  emailInvalid: string
  passwordTooShort: string
}

/**
 * 邮箱格式：单 `@`、两侧非空、域名含至少一个点且 TLD ≥ 2 个字符。
 *
 * 不追求 RFC 5322 完备——真正的把关在服务端。
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/

/** 必填文本：trim 后非空。输出为 trim 后的值。 */
function requiredText(msg: AuthFormMessages) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) ctx.addIssue({ code: 'custom', message: msg.required })
    })
}

/** 邮箱：先 trim，再判必填，最后判格式——空值只报必填。 */
function emailField(msg: AuthFormMessages) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: 'custom', message: msg.required })
        return
      }
      if (!EMAIL_PATTERN.test(value)) ctx.addIssue({ code: 'custom', message: msg.emailInvalid })
    })
}

/**
 * 密码：长度按**原始值**判断，不 trim。
 *
 * 前后空格是合法字符，只有「全是空白」才该被必填拦下。
 */
function passwordField(msg: AuthFormMessages) {
  return z.string().superRefine((value, ctx) => {
    if (value.trim().length === 0) {
      ctx.addIssue({ code: 'custom', message: msg.required })
      return
    }
    if (value.length < MIN_PASSWORD_LENGTH) {
      ctx.addIssue({ code: 'custom', message: msg.passwordTooShort })
    }
  })
}

/** 登录：邮箱 + 密码。 */
export function createLoginSchema(msg: AuthFormMessages) {
  return z.object({
    email: emailField(msg),
    password: passwordField(msg),
  })
}

/** 注册：昵称 + 邮箱 + 密码。昵称只判必填，不做格式校验。 */
export function createRegisterSchema(msg: AuthFormMessages) {
  return z.object({
    name: requiredText(msg),
    email: emailField(msg),
    password: passwordField(msg),
  })
}

/** 忘记密码：只有邮箱。 */
export function createForgotSchema(msg: AuthFormMessages) {
  return z.object({ email: emailField(msg) })
}

/** 重置密码：只有新密码。 */
export function createResetSchema(msg: AuthFormMessages) {
  return z.object({ password: passwordField(msg) })
}

/** 个人中心 · 资料：昵称。 */
export function createProfileSchema(msg: AuthFormMessages) {
  return z.object({ name: requiredText(msg) })
}

/**
 * 个人中心 · 修改密码。
 *
 * 当前密码**只判必填**，不套用 {@link MIN_PASSWORD_LENGTH}：老密码可能短于当前下限，
 * 卡长度会让用户永远改不了密码。新密码沿用下限。
 */
export function createChangePasswordSchema(msg: AuthFormMessages) {
  return z.object({
    currentPassword: requiredText(msg),
    newPassword: passwordField(msg),
  })
}

/** 个人中心 · 更换邮箱：复用登录表单的邮箱口径。 */
export function createChangeEmailSchema(msg: AuthFormMessages) {
  return z.object({ newEmail: emailField(msg) })
}
