import { useEffect, useState } from 'react'

/**
 * 输入框防抖：值稳定 `delay` 毫秒后才更新。
 *
 * 列表页用它把搜索框的每次按键合并成一次 URL 更新——逐键 `navigate` 会写满
 * 浏览器历史，也会让路由 loader 反复重跑。
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
