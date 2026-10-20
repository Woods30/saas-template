import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import { filterMenuItems, getPublicLinkOptions, type MenuContext } from './navigation'

export function getFooterLinks(locale: Locale, ctx: MenuContext) {
  return filterMenuItems(
    [
      {
        kind: 'group',
        id: 'product',
        title: m.footer_product(),
        items: [
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
            destination: {
              kind: 'internal',
              options: getPublicLinkOptions('home', locale, 'pricing'),
            },
          },
          {
            kind: 'link',
            id: 'changelog',
            title: m.footer_changelog(),
            visibility: { module: 'changelog' },
            destination: { kind: 'internal', options: getPublicLinkOptions('changelog', locale) },
          },
        ],
      },
      {
        kind: 'group',
        id: 'resources',
        title: m.footer_resources(),
        items: [
          {
            kind: 'link',
            id: 'docs',
            title: m.nav_docs(),
            visibility: { module: 'docs' },
            destination: { kind: 'internal', options: getPublicLinkOptions('docs', locale) },
          },
          {
            kind: 'link',
            id: 'blog',
            title: m.nav_blog(),
            visibility: { module: 'blog' },
            destination: { kind: 'internal', options: getPublicLinkOptions('blog', locale) },
          },
          {
            kind: 'link',
            id: 'terms',
            title: m.footer_terms(),
            destination: { kind: 'internal', options: getPublicLinkOptions('terms', locale) },
          },
          {
            kind: 'link',
            id: 'privacy',
            title: m.footer_privacy(),
            destination: { kind: 'internal', options: getPublicLinkOptions('privacy', locale) },
          },
          // contact 由 `contact` 模块门禁（路由 `beforeLoad` 抛 404），因此菜单项
          // 必须跟着开关走，否则默认配置下会给出一个点开即 404 的链接。
          {
            kind: 'link',
            id: 'contact',
            title: m.nav_contact(),
            visibility: { module: 'contact' },
            destination: { kind: 'internal', options: getPublicLinkOptions('contact', locale) },
          },
          // roadmap / waitlist 是静态营销页，没有对应模块开关，因此不设 visibility。
          {
            kind: 'link',
            id: 'roadmap',
            title: m.nav_roadmap(),
            destination: { kind: 'internal', options: getPublicLinkOptions('roadmap', locale) },
          },
          {
            kind: 'link',
            id: 'waitlist',
            title: m.nav_waitlist(),
            destination: { kind: 'internal', options: getPublicLinkOptions('waitlist', locale) },
          },
        ],
      },
    ],
    ctx,
  )
}
