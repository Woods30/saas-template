import type {
  CheckSubscribeStatusParams,
  NewsletterProvider,
  SubscribeNewsletterParams,
  UnsubscribeNewsletterParams,
} from '../types'

/**
 * Beehiiv v2 API provider — 直接 fetch（无 SDK）。
 * 端点以 Beehiiv 官方文档为准，验证后实现。
 * TODO(beehiiv): wire when API access available
 */
export class BeehiivNewsletterProvider implements NewsletterProvider {
  private readonly apiKey: string
  private readonly publicationId: string

  constructor(apiKey: string, publicationId: string) {
    this.apiKey = apiKey
    this.publicationId = publicationId
  }

  getProviderName(): string {
    return 'beehiiv'
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  async subscribe({ email }: SubscribeNewsletterParams): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.beehiiv.com/v2/publications/${this.publicationId}/subscriptions`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ email, send_welcome_email: true }),
        },
      )
      return res.ok
    } catch {
      return false
    }
  }

  async unsubscribe({ email }: UnsubscribeNewsletterParams): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.beehiiv.com/v2/publications/${this.publicationId}/subscriptions`,
        {
          method: 'DELETE',
          headers: this.headers(),
          body: JSON.stringify({ email }),
        },
      )
      return res.ok
    } catch {
      return false
    }
  }

  async checkSubscribeStatus({ email }: CheckSubscribeStatusParams): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.beehiiv.com/v2/publications/${this.publicationId}/subscriptions?email=${encodeURIComponent(email)}`,
        { headers: this.headers() },
      )
      if (!res.ok) return false
      const json = (await res.json()) as { data?: Array<{ status: string }> }
      return Boolean(json.data?.[0]?.status === 'active')
    } catch {
      return false
    }
  }
}
