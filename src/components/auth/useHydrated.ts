import { useSyncExternalStore } from 'react'

/** 订阅永不变化：水合完成后组件重渲染一次即可，无需外部事件源。 */
const noopSubscribe = () => () => {}

/**
 * 当前是否已在客户端完成水合。
 *
 * `useSyncExternalStore` 的 getServerSnapshot 返回 `false`、getSnapshot 返回 `true`，
 * 因此 SSR 与客户端首帧（水合前）一致，水合后 React 自行切换到 `true`——不需要
 * `useEffect` + `setState`，也就不会多一次「先渲染后纠正」的闪烁。
 *
 * 用途见 `SubmitButton`：认证表单在水合前必须禁用提交，否则点击会退化为浏览器原生
 * 表单提交（GET），把密码写进 URL。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}
