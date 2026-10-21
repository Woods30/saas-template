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
 * 依赖由调用方注入（`getAuth(env)` 内拿不到 ALS 的 mail registry）。
 *
 * 绝不抛出：回调经 `runInBackgroundOrAwait` 调用，抛错会让注册 / 登录失败，
 * 故所有异常收敛为 `{ ok: false, error }`。
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

/** 发送一封认证流程邮件；返回 `{ ok, error }` 而非抛出。 */
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
 * 回调第二个参数就是原始 `Request`，无需给 `getAuth(env)` 加参数。请求缺失时回退默认语言。
 */
export async function sendAuthEmailForRequest(
  input: AuthEmailRequestInput,
  request: Request | undefined,
  deps: AuthEmailDeps,
): Promise<SendEmailResult> {
  const locale = request ? resolveLocale(request) : defaultLocale
  return sendAuthEmail({ ...input, locale } as AuthEmailInput, deps)
}
