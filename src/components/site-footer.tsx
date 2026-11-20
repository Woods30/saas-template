import type { ComponentType, ReactNode, SVGProps } from 'react';
import { getRouteApi } from '@tanstack/react-router';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { openCookieSettings } from '@/lib/cookie-consent';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { LocaleSelector } from '@/components/locale-selector';

export interface FooterColumn {
  title: string;
  /**
   * external: open in a new tab. Off-site (http) hrefs always open in a new tab.
   * onClick: render a button instead of a link (e.g. "Cookie settings").
   */
  links: {
    label: string;
    href?: string;
    external?: boolean;
    onClick?: () => void;
  }[];
}

/** Off-site URLs render as plain <a>; internal paths use the locale-aware Link. */
const isExternalHref = (href: string) => /^https?:\/\//.test(href);

export interface FooterSocial {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string;
  label: string;
}

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54 0-.27-.01-1.15-.02-2.09-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.72.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.56 0-1.23.44-2.24 1.16-3.03-.12-.29-.5-1.44.11-3 0 0 .95-.3 3.1 1.16.9-.25 1.86-.37 2.82-.38.96.01 1.92.13 2.82.38 2.15-1.46 3.1-1.16 3.1-1.16.61 1.56.23 2.71.11 3 .72.79 1.16 1.8 1.16 3.03 0 4.32-2.64 5.27-5.15 5.55.4.35.76 1.03.76 2.08 0 1.5-.01 2.72-.01 3.09 0 .3.2.65.78.54 4.47-1.49 7.68-5.7 7.68-10.67C23.25 5.48 18.27.5 12 .5Z" />
    </svg>
  );
}

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

const DEFAULT_FOOTER_SOCIALS: FooterSocial[] = [
  { icon: GithubIcon, href: 'https://github.com', label: 'GitHub' },
  { icon: XIcon, href: 'https://x.com', label: 'X' },
];

const rootRoute = getRouteApi('__root__');

function defaultFooterColumns(cookieConsentEnabled: boolean): FooterColumn[] {
  return [
    {
      title: m['landing.footer.feature'](),
      links: [
        {
          label: m['landing.footer.settings'](),
          href: '/settings',
          external: true,
        },
        { label: m['landing.footer.admin'](), href: '/admin', external: true },
      ],
    },
    {
      title: m['landing.footer.resources'](),
      links: [
        { label: m['landing.footer.blog'](), href: '/blog' },
        {
          label: m['landing.footer.github'](),
          href: 'https://github.com',
          external: true,
        },
      ],
    },
    {
      title: m['landing.footer.legal'](),
      links: [
        { label: m['landing.footer.privacy'](), href: '/privacy-policy' },
        { label: m['landing.footer.terms'](), href: '/terms-of-service' },
        ...(cookieConsentEnabled
          ? [
              {
                label: m['landing.footer.cookie_settings'](),
                onClick: openCookieSettings,
              },
            ]
          : []),
      ],
    },
  ];
}

export function SiteFooter({
  tagline,
  columns,
  socials,
  copyright,
  badges,
}: {
  tagline?: string;
  columns?: FooterColumn[];
  socials?: FooterSocial[];
  copyright?: string;
  badges?: ReactNode;
}) {
  const cookieConsentEnabled =
    !!rootRoute.useLoaderData()?.cookieConsentEnabled;
  tagline ??= m['landing.footer.tagline']();
  columns ??= defaultFooterColumns(cookieConsentEnabled);
  socials ??= DEFAULT_FOOTER_SOCIALS;
  const year = new Date().getFullYear();

  return (
    <footer className="bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-7xl px-6 pt-14 pb-6 sm:px-10 sm:pt-16 lg:px-16">
        {tagline && (
          <p className="mb-12 w-full font-serif text-3xl leading-[1.15] tracking-tight text-neutral-100 italic sm:text-4xl">
            {tagline}
          </p>
        )}

        {columns && columns.length > 0 && (
          <div
            className={cn(
              'grid gap-x-8 gap-y-10 sm:gap-x-12',
              columns.length <= 3
                ? 'grid-cols-2 sm:grid-cols-3'
                : columns.length === 4
                  ? 'grid-cols-2 sm:grid-cols-4'
                  : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
            )}
          >
            {columns.map((col) => (
              <div key={col.title} className="space-y-5">
                <p className="text-[13px] font-semibold tracking-wide text-neutral-100">
                  {col.title}
                </p>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {link.onClick || !link.href ? (
                        <button
                          type="button"
                          onClick={link.onClick}
                          className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
                        >
                          {link.label}
                        </button>
                      ) : isExternalHref(link.href) ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          target={link.external ? '_blank' : undefined}
                          className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {badges}

        {/* Socials + language row */}
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          {socials && socials.length > 0 ? (
            <div className="flex items-center gap-5">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-300 transition-colors hover:text-neutral-100"
                >
                  <s.icon className="size-[18px]" />
                </a>
              ))}
            </div>
          ) : (
            <div />
          )}
          <LocaleSelector
            variant="pill"
            className="border-neutral-700 text-neutral-200 hover:bg-white/5 hover:text-neutral-50"
          />
        </div>

        {/* Bottom bar */}
        <div className="mt-6 flex flex-col gap-3 border-t border-neutral-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-neutral-400 sm:ml-auto">
            {copyright ||
              `© ${year} ${envConfigs.app_name}. All rights reserved.`}
          </span>
        </div>
      </div>
    </footer>
  );
}
