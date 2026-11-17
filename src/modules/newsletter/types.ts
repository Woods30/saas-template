import type { Locale } from '@/config/locale'

export interface SubscribeNewsletterParams {
  email: string
  locale?: Locale
}

export interface UnsubscribeNewsletterParams {
  email: string
}

export interface CheckSubscribeStatusParams {
  email: string
}

export interface NewsletterProvider {
  getProviderName(): string
  subscribe(params: SubscribeNewsletterParams): Promise<boolean>
  unsubscribe(params: UnsubscribeNewsletterParams): Promise<boolean>
  checkSubscribeStatus(params: CheckSubscribeStatusParams): Promise<boolean>
}
