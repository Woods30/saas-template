import { randomUUID } from 'node:crypto';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { getAllConfigs } from '@/modules/config/service';
import { recordVisitor } from '@/modules/operations/service';
import {
  getCookieFromHeader,
  sanitizeReferrer,
  sanitizeUtm,
} from '@/lib/cookie';
import {
  OPERATIONS_COOKIE,
  readVisitorCookie,
  signVisitor,
} from '@/lib/operations-cookie';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respErr, respOk } from '@/lib/resp';

const inputSchema = z
  .object({
    path: z
      .string()
      .max(191)
      .regex(/^\/(?!\/)[^?#]*$/),
    referrer: z.string().max(2048),
    test: z.boolean().optional(),
  })
  .strict();

async function POST({ request }: { request: Request }) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return respErr('Same-origin request required', { status: 403 });
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 500,
    keyPrefix: 'operations-visit',
  });
  if (limited) return limited;
  if (
    /bot|crawler|spider|headless/i.test(
      request.headers.get('user-agent') || ''
    ) ||
    request.headers.get('dnt') === '1' ||
    request.headers.get('sec-gpc') === '1'
  )
    return respOk();
  try {
    // A small, bounded JSON body; never accept an ID or user ID from the browser.
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return respErr('JSON required', { status: 415 });
    const reader = request.body?.getReader();
    let body = '';
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4096) {
          await reader.cancel();
          return respErr('Request too large', { status: 413 });
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    }
    const parsed = inputSchema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return respErr('Invalid visitor data', { status: 400 });
    if (
      /^\/(?:zh\/)?(?:admin|api|settings|sign-in|sign-up|reset-password|forgot-password|verify-email)(?:\/|$)/.test(
        parsed.data.path
      )
    )
      return respOk();
    const cookies = request.headers.get('cookie');
    const config = await getAllConfigs();
    if (
      getCookieFromHeader(cookies, 'cookie_consent') === 'rejected' ||
      (config.cookie_consent_enabled === 'true' &&
        getCookieFromHeader(cookies, 'cookie_consent') !== 'accepted')
    )
      return respOk();
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (session?.user) {
      const limitedUser = enforceMinIntervalRateLimit(request, {
        intervalMs: 1000,
        keyPrefix: 'operations-visit-user',
        extraKey: session.user.id,
      });
      if (limitedUser) return limitedUser;
    }
    const id = readVisitorCookie(request.headers) || randomUUID();
    let firstSource = '';
    try {
      firstSource = decodeURIComponent(
        getCookieFromHeader(cookies, 'utm_source') || ''
      );
    } catch {}
    let referrer = '';
    try {
      referrer = decodeURIComponent(
        getCookieFromHeader(cookies, 'first_referrer') || parsed.data.referrer
      );
    } catch {}
    const external = sanitizeReferrer(referrer, [new URL(request.url).host]);
    const source =
      sanitizeUtm(firstSource) || (external ? new URL(external).hostname : '');
    const country = (
      request.headers.get('cf-ipcountry') ||
      request.headers.get('x-vercel-ip-country') ||
      ''
    ).toUpperCase();
    await recordVisitor({
      id,
      userId: session?.user.id ?? null,
      source,
      country: /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : '',
      entryPath: parsed.data.path,
      buildId: import.meta.env?.VITE_BUILD_ID || 'development',
      excluded: parsed.data.test === true,
    });
    const response = respOk();
    response.headers.set(
      'Set-Cookie',
      `${OPERATIONS_COOKIE}=${signVisitor(id)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return respErr('Unable to record visit', { status: 400 });
  }
}

export const Route = createFileRoute('/api/operations/visit')({
  server: { handlers: { POST } },
});
