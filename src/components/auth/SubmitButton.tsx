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
 * 认证表单提交按钮：统一「提交中」的禁用态与可访问性标记。
 *
 * 此前各页写的是 `{submitting ? '…' : m.xxx()}`——一个裸省略号，既没有禁用语义
 * （`disabled` 是有的，但 `aria-busy` 缺失），也没有加载指示。
 *
 * **水合前一律禁用**。React 尚未接管时点击 `type="submit"` 会走浏览器原生表单提交：
 * 浏览器把字段拼成 query string 发 GET，于是**密码出现在地址栏、浏览器历史和
 * Referer 里**，页面还只是刷新一下（onSubmit 根本没跑）。禁用期间按钮仍是可见的，
 * 只是不可点，不会造成布局跳动；水合后立即恢复。
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
