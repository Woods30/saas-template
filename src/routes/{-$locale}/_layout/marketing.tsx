import { createFileRoute, Outlet } from '@tanstack/react-router'
import { MarketingLayout } from '@/blocks/marketing-layout'

export const Route = createFileRoute('/{-$locale}/_layout/marketing')({
  component: () => (
    <MarketingLayout>
      <Outlet />
    </MarketingLayout>
  ),
})
