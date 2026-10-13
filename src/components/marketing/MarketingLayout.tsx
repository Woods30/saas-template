import type { ReactNode } from 'react'
import { Footer } from './Footer'
import { Navbar } from './Navbar'

/**
 * 营销页统一 shell：顶部 Navbar + 内容 + 底部 Footer。
 * 由 `src/routes/{-$locale}/_layout/marketing.tsx` 路由文件包裹。
 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
