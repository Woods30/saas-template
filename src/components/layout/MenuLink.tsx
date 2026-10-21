import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { MenuLinkItem } from '@/config/navigation'

/**
 * 菜单链接的统一渲染器：内部链接透传 Router options，外链在 `newTab` 时补
 * `target` 与 `rel="noopener noreferrer"`。Navbar 与 Footer 共用。
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
