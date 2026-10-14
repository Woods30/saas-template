import type { Locale } from '@/config/locale'
import { getMailFrom } from '@/config/service-status'
import type { WebsiteConfig } from '@/config/website'
import type { ServerEnv } from '@/env/server'
import { defaultLocale, resolveLocale } from '@/lib/locale'
import type { sendMail } from '@/mail'
import type { EmailTemplate, SendEmailResult } from '@/mail/types'

/**
 * better-auth 回调与 mail registry 之间的桥梁。
 *
 * 设计要点：
 *
 * 1. **依赖注入**：`sendMail` / `config` / `serverEnv` 都由调用方传入。better-auth 的
 *    `getAuth(env)` 内没有 request，拿不到 ALS 的 mail registry；而注入让本模块可以在
 *    没有请求上下文的单测里直接验证。
 * 2. **绝不抛出**：`sendVerificationEmail` / `sendResetPassword` 由 better-auth 经
 *    `runInBackgroundOrAwait` 调用，回调抛错会让**注册 / 登录失败**。因此这里把所有
 *    异常收敛为 `{ ok: false, error }`，由调用方决定是否 `console.warn`。
 * 3. **邮件关闭即静默跳过**：`config.mail.enabled === false` 或发件人未配置时直接返回
 *    失败结果，不尝试发送。此时能否注册登录由 `auth.requireEmailVerification` 单独决定
 *    （见 `src/auth/flow.ts`）——邮件缺失不隐式降级该安全控制。
 */
export type AuthEmailKind = Extract<EmailTemplate, 'verifyEmail' | 'forgotPassword' | 'welcome'>

interface AuthEmailInputBase {
  to: string
  username: string
  locale: Locale
}

export type AuthEmailInput =
  | (AuthEmailInputBase & { kind: 'verifyEmail'; actionUrl: string })
  | (AuthEmailInputBase & { kind: 'forgotPassword'; actionUrl: string })
  | (AuthEmailInputBase & { kind: 'welcome' })

export interface AuthEmailDeps {
  sendMail: typeof sendMail
  config: WebsiteConfig
  serverEnv: ServerEnv
}

/**
 * 发送一封认证流程邮件。
 *
 * 返回 `{ ok, error }` 而非抛出：调用方（better-auth 回调）只做日志，不因邮件失败而
 * 中断注册 / 登录。
 */
export async function sendAuthEmail(
  input: AuthEmailInput,
  deps: AuthEmailDeps,
): Promise<SendEmailResult> {
  const { config, serverEnv } = deps
  if (!config.mail.enabled) {
    return { ok: false, error: 'mail module disabled' }
  }

  const fromAddress = getMailFrom(config, serverEnv)
  if (!fromAddress) {
    return { ok: false, error: 'mail sender not configured' }
  }

  const context =
    input.kind === 'welcome'
      ? { username: input.username }
      : { username: input.username, actionUrl: input.actionUrl }

  try {
    return await deps.sendMail(config.mail.provider, {
      to: input.to,
      template: input.kind,
      locale: input.locale,
      fromAddress,
      context,
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 去掉 `locale` 的输入形态；语言改由请求推导。 */
export type AuthEmailRequestInput =
  | Omit<Extract<AuthEmailInput, { kind: 'verifyEmail' }>, 'locale'>
  | Omit<Extract<AuthEmailInput, { kind: 'forgotPassword' }>, 'locale'>
  | Omit<Extract<AuthEmailInput, { kind: 'welcome' }>, 'locale'>

/**
 * better-auth 回调入口：从请求推导收件人语言后再发送。
 *
 * better-auth 的 `sendVerificationEmail` / `sendResetPassword` 第二个参数就是原始
 * `Request`，因此语言可以按「URL 前缀 → cookie → Accept-Language → 默认语言」解析，
 * 无需给 `getAuth(env)` 加 request 参数，也不依赖 ALS 时序。
 *
 * 请求缺失（测试或非 HTTP 调用路径）时回退默认语言。
 */
export async function sendAuthEmailForRequest(
  input: AuthEmailRequestInput,
  request: Request | undefined,
  deps: AuthEmailDeps,
): Promise<SendEmailResult> {
  const locale = request ? resolveLocale(request) : defaultLocale
  return sendAuthEmail({ ...input, locale } as AuthEmailInput, deps)
}
