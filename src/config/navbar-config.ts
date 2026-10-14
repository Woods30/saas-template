import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import {
  filterMenuItems,
  getPublicLinkOptions,
  type MenuContext,
  type MenuLinkItem,
} from './navigation'

export function getNavbarLinks(locale: Locale, ctx: MenuContext) {
  return filterMenuItems(
    [
      {
        kind: 'link',
        id: 'features',
        title: m.nav_features(),
        destination: {
          kind: 'internal',
          options: getPublicLinkOptions('home', locale, 'features'),
        },
      },
      {
        kind: 'link',
        id: 'workflow',
        title: m.nav_workflow(),
        destination: {
          kind: 'internal',
          options: getPublicLinkOptions('home', locale, 'workflow'),
        },
      },
      {
        kind: 'link',
        id: 'template',
        title: m.nav_template(),
        destination: { kind: 'internal', options: getPublicLinkOptions('home', locale, 'pricing') },
      },
      {
        kind: 'link',
        id: 'docs',
        title: m.nav_docs(),
        visibility: { module: 'docs' },
        destination: { kind: 'internal', options: getPublicLinkOptions('docs', locale) },
      },
    ],
    ctx,
  )
}

export function getNavbarActions(locale: Locale, config: MenuContext['config']) {
  return {
    login: {
      kind: 'link',
      id: 'login',
      title: m.nav_login(),
      destination: { kind: 'internal', options: getPublicLinkOptions('login', locale) },
    },
    primary: {
      kind: 'link',
      id: 'start',
      title: m.nav_start(),
      destination: {
        kind: 'internal',
        options: getPublicLinkOptions(config.docs.enabled ? 'docs' : 'home', locale, 'features'),
      },
    },
  } satisfies Record<'login' | 'primary', MenuLinkItem>
}
