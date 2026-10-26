import { IconLoader2 } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useHydrated } from '@/components/auth/useHydrated'
import { Button } from '@/components/ui/button'

interface SubmitButtonProps {
  pending: boolean
  children: ReactNode
  /** 提交中的文案；缺省沿用 `children`，但仍在视觉上给出加载指示。 */
  pendingLabel?: ReactNode
}

/**
 * 认证表单提交按钮：统一的「提交中」禁用态与加载指示。
 *
 * 水合前一律禁用——React 尚未接管时点 `type="submit"` 会走浏览器原生 GET 提交，
 * 把密码写进地址栏、历史与 Referer。禁用期间按钮仍可见，不造成布局跳动。
 */
export function SubmitButton({ pending, children, pendingLabel }: SubmitButtonProps) {
  const hydrated = useHydrated()
  const disabled = !hydrated || pending
  return (
    <Button type="submit" disabled={disabled} aria-busy={disabled} className="w-full">
      {pending ? (
        <>
          <IconLoader2 size={16} className="animate-spin" aria-hidden />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
