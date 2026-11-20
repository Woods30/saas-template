import type { GetContactOptions, LegacyCreateContactOptions, UpdateContactOptions } from 'resend'
import { Resend } from 'resend'
import type {
  CheckSubscribeStatusParams,
  NewsletterProvider,
  SubscribeNewsletterParams,
  UnsubscribeNewsletterParams,
} from '../types'

/** Resend Audiences provider — wraps `resend.contacts.*` API. */
export class ResendNewsletterProvider implements NewsletterProvider {
  private readonly client: Resend

  readonly audienceId: string

  constructor(apiKey: string, audienceId: string) {
    this.client = new Resend(apiKey)
    this.audienceId = audienceId
  }

  getProviderName(): string {
    return 'resend'
  }

  async subscribe({ email }: SubscribeNewsletterParams): Promise<boolean> {
    try {
      // LegacyCreateContactOptions is the only overload that accepts audienceId.
      const payload: LegacyCreateContactOptions = {
        email,
        audienceId: this.audienceId,
        unsubscribed: false,
      }
      const { error } = await this.client.contacts.create(payload)
      return !error
    } catch {
      return false
    }
  }

  async unsubscribe({ email }: UnsubscribeNewsletterParams): Promise<boolean> {
    try {
      const payload: UpdateContactOptions = {
        email,
        unsubscribed: true,
      }
      const { error } = await this.client.contacts.update(payload)
      return !error
    } catch {
      return false
    }
  }

  async checkSubscribeStatus({ email }: CheckSubscribeStatusParams): Promise<boolean> {
    try {
      const query: GetContactOptions = { email }
      const { data, error } = await this.client.contacts.get(query)
      if (error || !data) return false
      return !(data as { unsubscribed?: boolean }).unsubscribed
    } catch {
      return false
    }
  }
}
