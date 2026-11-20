import {
  Activity,
  Archive,
  Bell,
  Cloud,
  Compass,
  CreditCard,
  Database,
  FileText,
  Folder,
  Key,
  Mail,
  MailOpen,
  Palette,
  Rocket,
  Send,
  Settings,
  Users,
} from 'lucide-react';

/**
 * Document slug → icon. Used by the sidebar and the search dialog; slugs
 * that are not listed fall back to {@link DOC_FALLBACK_ICON}.
 */
export const DOC_ICON: Record<string, typeof FileText> = {
  'getting-started': Rocket,
  configuration: Settings,
  navigation: Compass,
  environment: Activity,
  email: Mail,
  'email-resend': Send,
  'email-cloudflare': MailOpen,
  newsletter: FileText,
  payment: CreditCard,
  notifications: Bell,
  analytics: Activity,
  cloudflare: Cloud,
  database: Database,
  storage: Archive,
  'api-keys': Key,
  'user-management': Users,
  'project-structure': Folder,
  'design-system': Palette,
};

/** The generic document icon for slugs that are not in {@link DOC_ICON}. */
export const DOC_FALLBACK_ICON = FileText;
