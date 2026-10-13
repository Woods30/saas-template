import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/blog/')({
  component: () => <div>blog</div>,
})
