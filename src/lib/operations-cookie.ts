import { createHmac, timingSafeEqual } from 'node:crypto';

import { envConfigs } from '@/config';

export const OPERATIONS_COOKIE = 'ops_visitor';
export function signVisitor(id: string) {
  return `${id}.${createHmac('sha256', envConfigs.auth_secret).update(`operations:${id}`).digest('hex')}`;
}
export function readVisitorCookie(headers: Headers): string | null {
  const value = headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${OPERATIONS_COOKIE}=`))
    ?.slice(OPERATIONS_COOKIE.length + 1);
  if (!value || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)) return null;
  const id = value.slice(0, 36);
  const expected = signVisitor(id);
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected)) ? id : null;
}
