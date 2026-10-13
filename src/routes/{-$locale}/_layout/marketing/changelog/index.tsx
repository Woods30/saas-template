import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/changelog/')({
  component: () => <div>changelog</div>,
})
