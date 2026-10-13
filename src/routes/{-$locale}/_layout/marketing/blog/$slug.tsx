import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/blog/$slug')({
  component: () => <div>blog slug</div>,
})
