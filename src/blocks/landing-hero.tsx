import { buttonVariants } from '@/components/ui/button'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { SourceProductDemo } from './source-product-demo'

/**
 * 首页的文档入口：外部文档站优先，其次站内 `/docs`，最后回退首页锚点。
 *
 * 文档站部署在外部时（`docs.siteUrl`），本仓没有 docs 子树，入口必须指向外站。
 */
function docsCtaHref(): string {
  if (websiteConfig.docs.siteUrl) return websiteConfig.docs.siteUrl
  return websiteConfig.docs.enabled ? `/${getLocale()}/docs` : '#features'
}

/**
 * 首页首屏。
 *
 * `price` 为展示用金额字符串（`null` 表示取不到价格）；`onMotionChange` 把演示
 * 动画的播放状态上抛，供外层容器切换 `data-motion`。
 */
export function LandingHero({
  price,
  onMotionChange,
}: {
  price: string | null
  onMotionChange: (running: boolean) => void
}) {
  return (
    <section className="lab-hero !bg-none mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="min-w-0">
        <p className="mb-6 flex items-center gap-3 font-semibold" lang="en">
          <svg
            width="25"
            height="20"
            viewBox="0 0 28 20"
            fill="none"
            className="text-primary"
            aria-hidden="true"
          >
            <path
              d="M1 17Q7 2 13 11Q20 -5 27 4"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
          {m.brand_slogan()}
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {m.home_hero_title()}
          {getLocale() === 'en' ? ' ' : ''}
          <br />
          {m.home_hero_title_emphasis()}
        </h1>
        <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
          {m.home_hero_description()}
        </p>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {m.home_hero_subtitle()}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#pricing" className={buttonVariants({ className: 'h-auto min-h-11 px-5 py-3' })}>
            {price ? m.home_hero_primary_cta({ price }) : m.home_hero_primary_cta_unknown()}
          </a>
          <a
            href={docsCtaHref()}
            className={buttonVariants({
              variant: 'outline',
              className: 'h-auto min-h-11 px-5 py-3',
            })}
          >
            {m.home_hero_secondary_cta()}
          </a>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">{m.home_hero_note()}</p>
      </div>
      <SourceProductDemo replayKey={0} onMotionChange={onMotionChange} />
    </section>
  )
}
