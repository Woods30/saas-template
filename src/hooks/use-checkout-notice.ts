import { useEffect, useRef } from 'react'
import { toast } from '@/components/ui/toast'

/** 结账回跳信号：URL 上 `?checkout=` 的取值。 */
export type CheckoutSignal = 'success' | 'cancelled' | undefined

interface UseCheckoutNoticeOptions {
  /** URL 上的结账信号；`undefined` 表示没有信号。 */
  checkout: CheckoutSignal
  /** toast 的类型与标题。 */
  type: 'success' | 'info'
  title: string
  /** 提示后清掉 URL 上的 `?checkout=`，避免刷新再弹一次。 */
  clearUrl: () => void
}

/**
 * 结账回跳的一次性提示。
 *
 * **必须幂等**：TanStack Start 的 hydration 流程会让组件的 effect 重跑一次，
 * 裸 `toast.add` 于是弹两次「支付成功」。`useRef` 在两次之间保留值，
 * 因此用它记录「已提示」，只有第一次真正执行。
 *
 * 提示与清 URL 都放进同一个守卫里：清 URL 后 `checkout` 变成 `undefined`，
 * effect 会再跑一次，两件事都只该发生一次。
 */
export function useCheckoutNotice({
  checkout,
  type,
  title,
  clearUrl,
}: UseCheckoutNoticeOptions): void {
  const handledRef = useRef(false)

  useEffect(() => {
    if (!checkout || handledRef.current) return
    handledRef.current = true
    toast.add({ type, title })
    clearUrl()
  }, [checkout, type, title, clearUrl])
}
