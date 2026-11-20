import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

import { useSession } from '@/core/auth/client';
import { usePathname } from '@/core/i18n/navigation';
import { apiPost } from '@/lib/api-client';

export function OperationsTracker({ allowed }: { allowed: boolean }) {
  const path = usePathname();
  const { data: session, isPending } = useSession();
  const last = useRef('');
  const track = useMutation({
    mutationFn: (input: { path: string; referrer: string; test: boolean }) =>
      apiPost('/api/operations/visit', input),
    retry: false,
  });
  useEffect(() => {
    if (
      !allowed ||
      isPending ||
      navigator.doNotTrack === '1' ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl
    )
      return;
    if (
      /^\/(?:admin|api|settings|sign-in|sign-up|reset-password|forgot-password|verify-email)(?:\/|$)/.test(
        path
      )
    )
      return;
    const key = `${session?.user.id ?? 'anonymous'}:${path}`;
    if (last.current === key) return;
    last.current = key;
    track.mutate({
      path: path.slice(0, 191),
      referrer: document.referrer.slice(0, 2048),
      test: new URLSearchParams(window.location.search).get('ops_test') === '1',
    });
  }, [allowed, isPending, session?.user.id, path, track.mutate]);
  return null;
}
