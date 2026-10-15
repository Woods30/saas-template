/**
 * 跨组件的可访问性类名常量。
 *
 * `src/components/ui/` 是 shadcn 上游原件，不本地修改；需要调整外观时在调用处传
 * `className`。这里集中存放需要复用的 override，避免散落各处。
 */

/**
 * destructive 按钮的焦点环 override。
 *
 * base-nova 的 destructive variant 自带 `focus-visible:ring-destructive/20` 与
 * `focus-visible:border-destructive/40`——深色下对页面背景仅 1.70:1，低于 WCAG 2.2
 * 的 3:1 非文本对比下限。传本常量给 destructive 按钮的 `className`，`cn`（基于
 * twMerge）会用高对比的 `--ring` 覆盖同名工具类。
 */
export const destructiveFocusRing =
  'focus-visible:ring-ring/50 focus-visible:border-ring dark:focus-visible:ring-ring/50'
