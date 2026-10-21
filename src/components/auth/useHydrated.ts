import { useSyncExternalStore } from 'react'

/** 订阅永不变化：水合完成后组件重渲染一次即可，无需外部事件源。 */
const noopSubscribe = () => () => {}

/**
 * 是否已在客户端完成水合。`useSyncExternalStore` 的 server snapshot 为 `false`、
 * 客户端为 `true`，SSR 与首帧一致，且不需要 `useEffect` + `setState` 的额外闪烁。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}
