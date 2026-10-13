import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/{-$locale}/')({
  beforeLoad: () => {
    throw redirect({ to: '/{-$locale}/marketing' })
  },
  component: () => null,
})
