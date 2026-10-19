import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { BrandLogo } from '@/components/layout/BrandLogo'
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
        className="mx-auto mb-6 flex items-center rounded-lg bg-logo-plate px-2 py-1 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <BrandLogo className="w-32" />
      </Link>
      <Card>
        <CardHeader>
          {/*
            base-nova 的 `CardTitle` 渲染 `<div>`（旧版手写件是 `<h3>`），而这里是认证页
            唯一的标题——直接用它会让页面没有 heading（屏幕阅读器无法按标题导航，e2e 的
            `getByRole('heading')` 也会失配）。ui 原件不本地修改，改在此处补回语义：
            `<h1>` 包住标题文本，Tailwind preflight 已把标题的字号/字重重置为 inherit，
            因此外观仍由 `CardTitle` 的类名决定。
          */}
          <CardTitle>
            <h1>{title}</h1>
          </CardTitle>
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
