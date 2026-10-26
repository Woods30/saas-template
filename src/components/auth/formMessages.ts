import type { AuthFormMessages } from '@/auth/validation'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 认证表单的校验文案（当前语言）。schema 工厂接收文案而非自己调 `m.*()`，
 * 这样校验逻辑不依赖 Paraglide 运行时、可脱离组件单测。
 */
export function authFormMessages(): AuthFormMessages {
  return {
    required: m.auth_field_required(),
    emailInvalid: m.auth_field_email_invalid(),
    passwordTooShort: m.auth_field_password_too_short(),
  }
}
