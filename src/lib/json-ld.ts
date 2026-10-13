import { websiteConfig } from '@/config/website'
import { getBaseUrl } from '@/lib/urls'

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: websiteConfig.metadata.name,
    url: getBaseUrl(),
    logo: `${getBaseUrl()}/icon.svg`,
  }
}

export function softwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: websiteConfig.metadata.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
  }
}

export function breadcrumbJsonLd(items: Array<{ name: string; href: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${getBaseUrl()}${it.href}`,
    })),
  }
}

export function articleJsonLd(opts: {
  title: string
  description: string
  date: string
  author?: string
  path: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    datePublished: opts.date,
    author: { '@type': 'Person', name: opts.author ?? websiteConfig.metadata.name },
    url: `${getBaseUrl()}${opts.path}`,
  }
}
