/**
 * 跨组件的可访问性类名常量。
 *
 * `src/components/ui/` 是 shadcn 上游原件不本地修改，需要复用的 override 集中放这里。
 */

/**
 * destructive 按钮的焦点环 override。
 *
 * 上游 destructive variant 的焦点环在深色下仅 1.70:1，低于 WCAG 2.2 的 3:1 下限；
 * `cn`（twMerge）会用高对比的 `--ring` 覆盖同名工具类。
 */
export const destructiveFocusRing =
  'focus-visible:ring-ring/50 focus-visible:border-ring dark:focus-visible:ring-ring/50'
