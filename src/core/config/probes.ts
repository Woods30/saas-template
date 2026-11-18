/**
 * 「测试连接」探针。
 *
 * 只做**鉴权层**的轻量请求（余额 / 商品列表 / 域名列表），不发信、不建单：
 * 目的是让管理员在后台确认凭据可用，而不是验证整条业务链路。返回值只含
 * 状态与简短说明，**不回显凭据**。
 */

export type ProbeTarget = 'payment' | 'mail'

export interface ProbeResult {
  ok: boolean
  message: string
}

/** 单次探测的超时：外部服务卡住时后台按钮不能一直转。 */
const PROBE_TIMEOUT_MS = 10_000

async function probe(
  url: string,
  init: RequestInit,
  describe: (response: Response) => Promise<string>,
): Promise<ProbeResult> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    if (response.ok) return { ok: true, message: await describe(response) }
    return { ok: false, message: `HTTP ${response.status}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export interface ProbeInput {
  payment: {
    provider: 'stripe' | 'creem'
    stripeSecretKey?: string
    creemApiKey?: string
    creemDebug: boolean
  }
  mail: {
    provider: 'resend' | 'cloudflare'
    resendApiKey?: string
    cloudflareSender?: string
    cloudflareBinding: boolean
  }
}

export async function probeConnection(
  target: ProbeTarget,
  input: ProbeInput,
): Promise<ProbeResult> {
  if (target === 'payment') {
    if (input.payment.provider === 'creem') {
      if (!input.payment.creemApiKey) return { ok: false, message: '缺少 Creem API Key' }
      const baseUrl = input.payment.creemDebug
        ? 'https://test-api.creem.io'
        : 'https://api.creem.io'
      return probe(
        `${baseUrl}/v1/products?limit=1`,
        { headers: { 'x-api-key': input.payment.creemApiKey } },
        async () => 'Creem 凭据可用',
      )
    }
    if (!input.payment.stripeSecretKey) return { ok: false, message: '缺少 Stripe Secret Key' }
    return probe(
      'https://api.stripe.com/v1/balance',
      { headers: { Authorization: `Bearer ${input.payment.stripeSecretKey}` } },
      async () => 'Stripe 凭据可用',
    )
  }

  if (input.mail.provider === 'cloudflare') {
    if (!input.mail.cloudflareSender) return { ok: false, message: '缺少发件人地址' }
    if (!input.mail.cloudflareBinding) {
      return { ok: false, message: '当前环境没有 EMAIL binding，部署到 Cloudflare 后再测' }
    }
    return { ok: true, message: '发件人与 EMAIL binding 均已就绪' }
  }
  if (!input.mail.resendApiKey) return { ok: false, message: '缺少 Resend API Key' }
  return probe(
    'https://api.resend.com/domains',
    { headers: { Authorization: `Bearer ${input.mail.resendApiKey}` } },
    async () => 'Resend 凭据可用',
  )
}
