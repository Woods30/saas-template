import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { BrandLogo } from '@/components/layout/BrandLogo'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

interface AuthLayoutProps {
  title: string
  description?: string
  /** 只在 login / register 传：声明的前提是「用户此刻正在同意」，其余认证页无此语义。 */
  legalNotice?: boolean
  children: ReactNode
}

/** 认证页共享外壳：居中窄栏 + 品牌 logo（回首页）+ 标题描述槽。 */
export function AuthLayout({ title, description, legalNotice, children }: AuthLayoutProps) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-10">
      <Link
        to="/{-$locale}"
        params={{ locale: getLocale() }}
        aria-label={websiteConfig.metadata.name}
        className="mx-auto mb-6 flex items-center rounded-lg bg-logo-plate px-2 py-1 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <BrandLogo className="w-32" />
      </Link>
      <Card>
        <CardHeader>
          {/* base-nova 的 `CardTitle` 渲染 `<div>`，直接用会让页面没有 heading
              （读屏无法按标题导航，e2e 的 `getByRole('heading')` 也会失配）。 */}
          <CardTitle>
            <h1>{title}</h1>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {legalNotice && (
          <CardFooter className="block">
            <p className="text-center text-xs leading-relaxed text-muted-foreground text-balance">
              {m.auth_legal_disclaimer()}{' '}
              <Link
                to="/{-$locale}/marketing/legal/$slug"
                params={{ locale: getLocale(), slug: 'terms' }}
                className="underline hover:text-foreground"
              >
                {m.footer_terms()}
              </Link>{' '}
              {m.auth_legal_and()}{' '}
              <Link
                to="/{-$locale}/marketing/legal/$slug"
                params={{ locale: getLocale(), slug: 'privacy' }}
                className="underline hover:text-foreground"
              >
                {m.footer_privacy()}
              </Link>
            </p>
          </CardFooter>
        )}
      </Card>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link
          to="/{-$locale}"
          params={{ locale: getLocale() }}
          className="underline hover:text-foreground"
        >
          {m.auth_back_home()}
        </Link>
      </p>
    </main>
  )
}
