import type { AuthFormMessages } from '@/auth/validation'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 认证表单的校验文案（当前语言）。
 *
 * schema 工厂刻意**接收文案**而不是自己调 `m.*()`，这样校验逻辑不依赖 Paraglide 运行时、
 * 可以脱离组件单测（见 `src/auth/validation.ts` 的文件头注释）。文案的求值收在这里，
 * 四个认证页共用一份，避免同一个映射抄四遍。
 */
export function authFormMessages(): AuthFormMessages {
  return {
    required: m.auth_field_required(),
    emailInvalid: m.auth_field_email_invalid(),
    passwordTooShort: m.auth_field_password_too_short(),
  }
}
