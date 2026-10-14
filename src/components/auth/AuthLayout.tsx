import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

interface AuthLayoutProps {
  title: string
  description?: string
  children: ReactNode
}

/**
 * 认证页共享外壳。
 *
 * 此前 5 个认证页各自重复 `<main className="mx-auto max-w-md p-6"><Card>…`，视觉与
 * 语义都会随页面漂移。这里收敛为单一实现：居中窄栏 + 品牌 logo（回首页）+ 标题描述槽。
 */
export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-10">
      <Link
        to="/{-$locale}"
        params={{ locale: getLocale() }}
        aria-label={websiteConfig.metadata.name}
        className="mx-auto mb-6 flex items-center rounded-lg px-2 py-1 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring dark:bg-white"
      >
        <img
          src={websiteConfig.metadata.images.logoLight}
          alt=""
          width={1400}
          height={380}
          className="h-auto w-32"
        />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
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
