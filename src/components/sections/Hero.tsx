import { IconArrowUpRight } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export interface HeroProps {
  title: string
  titleLang?: string
  titleEmphasis?: string
  eyebrow?: string
  subtitle?: string
  description?: string
  note?: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  visual?: ReactNode
  variant?: 'default' | 'split'
  image?: { src: string; alt: string }
  /** 覆盖图片默认样式，用于品牌吉祥物等无边框场景。 */
  imageClassName?: string
  align?: 'left' | 'center'
}

export function Hero(props: HeroProps) {
  const align = props.align ?? 'left'
  const split = props.variant === 'split'
  return (
    <section
      className={
        split
          ? 'mx-auto grid max-w-6xl items-center gap-12 px-6 py-14 md:py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-14'
          : `mx-auto max-w-5xl px-6 py-20 ${align === 'center' ? 'text-center' : ''}`
      }
    >
      <div className="min-w-0">
        {props.eyebrow && (
          <p className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full bg-highlight" />
            {props.eyebrow}
          </p>
        )}
        <h1
          lang={props.titleLang}
          className={
            split
              ? 'text-[2.35rem] font-semibold leading-[1.2] tracking-tight sm:text-5xl lg:text-[3.4rem]'
              : 'text-4xl font-bold tracking-tight md:text-6xl'
          }
        >
          {props.title}
          {props.titleEmphasis && (
            <span className="mt-2 block text-primary">{props.titleEmphasis}</span>
          )}
        </h1>
        {props.subtitle && <p className="mt-4 text-lg text-muted-foreground">{props.subtitle}</p>}
        {props.description && (
          <p
            className={
              split
                ? 'mt-6 max-w-xl text-base leading-relaxed text-muted-foreground'
                : 'mt-2 text-base text-muted-foreground'
            }
          >
            {props.description}
          </p>
        )}
        {(props.primaryCta || props.secondaryCta) && (
          <div
            className={`mt-8 flex flex-wrap gap-3 ${align === 'center' ? 'justify-center' : ''}`}
          >
            {props.primaryCta && (
              <Link
                to={props.primaryCta.href}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
              >
                {props.primaryCta.label}
                <IconArrowUpRight size={17} aria-hidden="true" />
              </Link>
            )}
            {props.secondaryCta &&
              (props.secondaryCta.href.startsWith('#') ? (
                <a
                  href={props.secondaryCta.href}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-5 py-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
                >
                  {props.secondaryCta.label}
                </a>
              ) : (
                <Link
                  to={props.secondaryCta.href}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-5 py-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
                  preload="render"
                >
                  {props.secondaryCta.label}
                </Link>
              ))}
          </div>
        )}
        {props.note && (
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{props.note}</p>
        )}
      </div>
      {props.visual}
      {props.image && (
        <img
          src={props.image.src}
          alt={props.image.alt}
          className={props.imageClassName ?? 'mt-10 rounded-lg border shadow-sm'}
          decoding="async"
          width={800}
          height={450}
        />
      )}
    </section>
  )
}
