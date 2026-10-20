import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldDescription } from '@/components/ui/field'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

interface AuthLayoutProps {
  title: string
  description?: string
  /**
   * 是否渲染「同意服务条款与隐私政策」声明。
   *
   * **只有正在创建账号或登录的页面才传**（login / register）：声明的前提是「用户
   * 此刻正在同意」，另外 4 个认证页都没有这个语义——`verify-email` 是终态、根本
   * 没有提交按钮，`reset-password` / `forgot-password` 用户也不在创建账号，`error`
   * 更没有任何可同意的动作。 defaults to `false` 让它们默认干净。
   */
  legalNotice?: boolean
  children: ReactNode
}

/**
 * 认证页共享外壳。
 *
 * 此前 5 个认证页各自重复 `<main className="mx-auto max-w-md p-6"><Card>…`，视觉与
 * 语义都会随页面漂移。这里收敛为单一实现：居中窄栏 + 品牌 logo（回首页）+ 标题描述槽。
 */
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
      {/* 法律声明是 `<Card>` 的**同级**而非子元素，与 shadcn `login-03` 块一致：
          放进卡片里会被读成表单的一部分（甚至像一条校验提示），放在卡片外才读得
          出「这是页面级的同意条款」。

          `FieldDescription` 默认 `text-left text-sm`，这里按本仓认证外壳的惯例用
          `className` 覆盖成 `text-center text-xs`（`cn` 走 twMerge，后者胜）。
          `mt-6` 与下方「返回首页」一致，且不加水平 padding：本栏是 `max-w-md` 居中，
          shadcn 的 `px-6` 会让这段文字比卡片窄一截，视觉对不齐。 */}
      {legalNotice && (
        <FieldDescription className="mt-6 text-center text-xs">
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
        </FieldDescription>
      )}
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
