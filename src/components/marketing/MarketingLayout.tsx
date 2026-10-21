import type { ReactNode } from 'react'
import { Footer } from './Footer'
import { Navbar } from './Navbar'

/** 营销页统一 shell：Navbar + 内容 + Footer。 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
