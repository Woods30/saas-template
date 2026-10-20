import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { m } from '@/locale/paraglide/messages.js'
import type { NewsletterCtaProps } from './types'

export function NewsletterCta({
  title,
  description,
  placeholder = 'you@example.com',
  successMessage,
}: NewsletterCtaProps) {
  // 反馈分级沿用 `content/docs/forms.md` 的分级表（`dashboard/admin/users.tsx` 的
  // `run()` 同一套）：**成功走全局 toast，失败留在表单内**。失败时用户要回头改邮箱，
  // 线索必须留在原地——toast 出现的位置离输入框远，且一闪而过。
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h2 className="text-3xl font-bold">{title}</h2>
      {description && <p className="mt-2 text-muted-foreground">{description}</p>}
      <form
        className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        onSubmit={async (e) => {
          e.preventDefault()
          setLoading(true)
          setError(null)
          const email = (new FormData(e.currentTarget).get('email') as string) ?? ''
          try {
            const res = await fetch('/api/newsletter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            })
            if (!res.ok) {
              setError(m.newsletter_error())
              return
            }
            toast.add({ type: 'success', title: successMessage ?? m.newsletter_success() })
          } catch {
            setError(m.newsletter_error())
          } finally {
            // 放在 finally 里：不论成功或失败按钮都要解禁，否则用户改不了邮箱重试。
            setLoading(false)
          }
        }}
      >
        <Input
          name="email"
          type="email"
          required
          placeholder={placeholder}
          className="sm:max-w-xs"
        />
        <Button type="submit" disabled={loading}>
          {m.newsletter_subscribe()}
        </Button>
      </form>
      {/* 失败留在原地的唯一承载点：`role="alert"` 让屏幕阅读器即时播报。
          注意别再写成 `{error}: {error}` ——`error` 里存的是一整句文案。 */}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
