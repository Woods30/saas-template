import type { WebsiteConfig } from '@/config/website'
import type { RuntimeEnv } from '@/core/env/server'

/** 社交登录凭据（来自数据库配置合成后的运行期 env）。 */
export type SocialCredentials = Pick<
  RuntimeEnv,
  'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET'
>

/** better-auth 的 `socialProviders` 选项。 */
export interface SocialProviderOptions {
  google?: { clientId: string; clientSecret: string }
  github?: { clientId: string; clientSecret: string }
}

/**
 * 社交登录 provider 的唯一判定。
 *
 * 方法开关与两个凭据缺一不可：只配 clientId 时 better-auth 也不会启用该 provider。
 * 页面可见性（`providers.ts`）与服务端注册（`auth.ts`）都读这一份，避免两处漂移。
 */
export function socialProviderOptions(
  config: WebsiteConfig,
  env: SocialCredentials,
): SocialProviderOptions {
  return {
    google:
      config.auth.googleEnabled && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }
        : undefined,
    github:
      config.auth.githubEnabled && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          }
        : undefined,
  }
}
