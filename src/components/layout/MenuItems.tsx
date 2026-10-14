import type { MenuItem } from '@/config/navigation'
import { MenuLink } from './MenuLink'

/**
 * 菜单项的共享 renderer，按 `variant` 决定分组呈现方式：
 *
 * - `navbar`：group 渲染为原生 `<details>/<summary>`（键盘可展开，无需脚本）；
 * - `footer`：group 渲染为 `<nav aria-label>` + `<h2>` + 子项。
 *
 * link 一律交给 {@link MenuLink}，保证内部 / 外链的目标与安全属性只有一处定义。
 * `onNavigate` 透传给每条链接，供调用方在导航后关闭移动面板与已展开的 details。
 */
export function MenuItems({
  items,
  variant,
  linkClassName,
  onNavigate,
}: {
  items: readonly MenuItem[]
  variant: 'navbar' | 'footer'
  linkClassName?: string
  onNavigate?: () => void
}) {
  return (
    <>
      {items.map((item) => {
        if (item.kind === 'separator') {
          return <hr key={item.id} className="my-2 border-border" />
        }
        if (item.kind === 'link') {
          return (
            <MenuLink key={item.id} item={item} className={linkClassName} onClick={onNavigate} />
          )
        }
        if (variant === 'footer') {
          return (
            <nav key={item.id} aria-label={item.title} className="flex flex-col gap-3">
              <h2 className="mb-1 text-sm font-semibold">{item.title}</h2>
              <MenuItems
                items={item.items}
                variant={variant}
                linkClassName={linkClassName}
                onNavigate={onNavigate}
              />
            </nav>
          )
        }
        return (
          <details key={item.id} className="relative">
            <summary className={`${linkClassName ?? ''} cursor-pointer`}>{item.title}</summary>
            <div className="absolute left-0 top-full z-50 mt-1 flex min-w-40 flex-col gap-1 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md">
              <MenuItems
                items={item.items}
                variant={variant}
                linkClassName={linkClassName}
                onNavigate={onNavigate}
              />
            </div>
          </details>
        )
      })}
    </>
  )
}
