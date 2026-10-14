import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { MenuLinkItem } from '@/config/navigation'

/**
 * 菜单链接的统一渲染器：把 {@link MenuLinkItem} 的判别联合直接展开为真实路由
 * 选项或外链。
 *
 * - `internal`：透传 `getPublicLinkOptions` 生成的 Router options（含 locale / hash / slug）；
 * - `external`：渲染 `<a>`，`newTab` 为真时补 `target="_blank"` 与 `rel="noopener noreferrer"`。
 *
 * Navbar 与 Footer 共用同一实现，保证导航来源与安全属性只有一处定义。
 */
export function MenuLink({
  item,
  className,
  onClick,
  children,
}: {
  item: MenuLinkItem
  className?: string
  onClick?: () => void
  children?: ReactNode
}) {
  const content = children ?? item.title
  if (item.destination.kind === 'internal') {
    return (
      <Link {...item.destination.options} className={className} onClick={onClick}>
        {content}
      </Link>
    )
  }
  return (
    <a
      href={item.destination.href}
      className={className}
      onClick={onClick}
      target={item.destination.newTab ? '_blank' : undefined}
      rel={item.destination.newTab ? 'noopener noreferrer' : undefined}
    >
      {content}
    </a>
  )
}
