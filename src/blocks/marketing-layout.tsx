import type { ReactNode } from 'react'
import { Footer } from './footer'
import { Header } from './header'

/** 营销页统一 shell：Header + 内容 + Footer。 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
