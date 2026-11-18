import { useId } from 'react'
import { m } from '@/locale/paraglide/messages.js'

/** 首页品牌故事：宣言 + 两段缘起。 */
export function LandingBrandStory() {
  const id = useId()
  return (
    <section
      id="story"
      aria-labelledby={id}
      className="leap-story lab-reveal mx-auto max-w-6xl px-6 py-16 md:py-24"
    >
      <div className="leap-story-manifesto">
        <p className="text-xs font-semibold tracking-widest text-primary">
          {m.home_story_eyebrow()}
        </p>
        <h2
          id={id}
          className="mt-5 max-w-md text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
        >
          {m.home_story_title()}
        </h2>
        <p className="mt-5 text-lg font-semibold text-primary" lang="en">
          {m.brand_slogan()}
        </p>
      </div>
      <div className="leap-story-copy">
        <p>{m.home_story_origin()}</p>
        <p>{m.home_story_makers()}</p>
      </div>
    </section>
  )
}
