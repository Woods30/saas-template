import {
  IconBrandBluesky,
  IconBrandDiscord,
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandMastodon,
  IconBrandTelegram,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconMail,
  type TablerIcon,
} from '@tabler/icons-react'
import { z } from 'zod'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import type { MenuLinkItem } from './navigation'
import type { SocialPlatform, WebsiteConfig } from './website'

const platforms = [
  { platform: 'github', label: 'GitHub', icon: IconBrandGithub },
  { platform: 'x', label: 'X', icon: IconBrandX },
  { platform: 'bluesky', label: 'Bluesky', icon: IconBrandBluesky },
  { platform: 'mastodon', label: 'Mastodon', icon: IconBrandMastodon },
  { platform: 'discord', label: 'Discord', icon: IconBrandDiscord },
  { platform: 'youtube', label: 'YouTube', icon: IconBrandYoutube },
  { platform: 'linkedin', label: 'LinkedIn', icon: IconBrandLinkedin },
  { platform: 'facebook', label: 'Facebook', icon: IconBrandFacebook },
  { platform: 'instagram', label: 'Instagram', icon: IconBrandInstagram },
  { platform: 'tiktok', label: 'TikTok', icon: IconBrandTiktok },
  { platform: 'telegram', label: 'Telegram', icon: IconBrandTelegram },
] as const satisfies readonly { platform: SocialPlatform; label: string; icon: TablerIcon }[]

export function isSafeSocialUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

export function getSocialLinks(config: WebsiteConfig, locale: Locale): MenuLinkItem[] {
  const links: MenuLinkItem[] = []
  for (const { platform, label, icon } of platforms) {
    const href = config.social[platform]
    if (href && isSafeSocialUrl(href)) {
      links.push({
        kind: 'link',
        id: platform,
        title: label,
        icon,
        destination: { kind: 'external', href, newTab: true },
      })
    }
  }
  if (config.mail.supportEmail && z.email().safeParse(config.mail.supportEmail).success) {
    links.push({
      kind: 'link',
      id: 'support',
      title: m.social_support({}, { locale }),
      icon: IconMail,
      destination: { kind: 'external', href: `mailto:${config.mail.supportEmail}`, newTab: false },
    })
  }
  return links
}
