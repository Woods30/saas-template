import { createFileRoute, redirect } from '@tanstack/react-router'

// `/marketing` 作为 `/` 的别名保留（避免既有深链断裂），使同一内容只有一个 URL。
export const Route = createFileRoute('/{-$locale}/_layout/marketing/')({
  beforeLoad: () => {
    throw redirect({ to: '/{-$locale}' })
  },
  component: () => null,
})
