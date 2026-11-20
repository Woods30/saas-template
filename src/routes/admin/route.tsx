import { createFileRoute, Outlet } from '@tanstack/react-router';
import {
  BadgeCheck,
  Bot,
  ChartNoAxesCombined,
  CreditCard,
  FolderOpen,
  Home,
  LayoutDashboard,
  Radar,
  Settings,
  Shield,
} from 'lucide-react';

import { matchPermission } from '@/core/auth/rbac';
import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { AppLayout } from '@/components/app-layout';

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
});

function AdminLayout() {
  const { data: permissions } = useUserPermissions();
  const isSuperAdmin = permissions?.permissions?.includes('*') === true;
  const group = m['common.systems.admin']();
  const navItems = [
    {
      href: '/admin',
      label: m['admin.nav.overview'](),
      icon: LayoutDashboard,
      group,
    },
    {
      href: '/admin/users',
      label: m['admin.nav.rbac'](),
      icon: Shield,
      group,
      items: [
        { href: '/admin/users', label: m['admin.nav.users']() },
        { href: '/admin/invite-codes', label: m['admin.nav.invite_codes']() },
        { href: '/admin/roles', label: m['admin.nav.roles']() },
        { href: '/admin/permissions', label: m['admin.nav.permissions']() },
      ],
    },
    {
      href: '/admin/payments',
      label: m['admin.nav.billing'](),
      icon: CreditCard,
      group,
      items: [
        { href: '/admin/payments', label: m['admin.nav.payments']() },
        { href: '/admin/subscriptions', label: m['admin.nav.subscriptions']() },
        { href: '/admin/credits', label: m['admin.nav.credits']() },
      ],
    },
    {
      href: '/admin/categories',
      label: m['admin.nav.content'](),
      icon: FolderOpen,
      group,
      items: [
        { href: '/admin/categories', label: m['admin.nav.categories']() },
        { href: '/admin/posts', label: m['admin.nav.posts']() },
        { href: '/admin/guest-posts', label: m['admin.nav.guest_posts']() },
        { href: '/admin/tickets', label: m['admin.nav.tickets']() },
      ],
    },
  ];

  if (
    matchPermission('admin.operations.read', permissions?.permissions ?? [])
  ) {
    navItems.splice(1, 0, {
      href: '/admin/operations',
      label: m['admin.nav.operations'](),
      icon: ChartNoAxesCombined,
      group,
    });
  }

  const footerNavItems = [
    ...(isSuperAdmin
      ? [
          {
            href: '/admin/footer-badges',
            label: m['admin.nav.footer_badges'](),
            icon: BadgeCheck,
          },
        ]
      : []),
    {
      href: '/admin/agent',
      label: m['admin.nav.agent'](),
      icon: Bot,
    },
    ...(matchPermission('admin.indexnow.read', permissions?.permissions ?? [])
      ? [
          {
            href: '/admin/indexnow',
            label: m['admin.nav.indexnow'](),
            icon: Radar,
          },
        ]
      : []),
    {
      href: '/admin/settings',
      label: m['admin.nav.settings'](),
      icon: Settings,
    },
    { href: '/', label: m['common.systems.home'](), icon: Home, newTab: true },
  ];

  return (
    <AppLayout
      navItems={navItems}
      footerNavItems={footerNavItems}
      brand={envConfigs.app_name}
      logo={envConfigs.app_logo}
      brandHref="/admin"
      profileHref="/settings/profile"
      requirePermission="admin.*"
    >
      <Outlet />
    </AppLayout>
  );
}
