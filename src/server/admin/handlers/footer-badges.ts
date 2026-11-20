import { DEFAULT_FOOTER_BADGES } from '@/features/footer-badges/defaults';
import {
  parseStoredFooterBadges,
  validateFooterBadges,
} from '@/features/footer-badges/validation';
import type { AdminHandlerContext } from '@/server/admin/types';

import {
  getStoredFooterBadges,
  saveStoredFooterBadges,
} from '@/modules/footer-badges/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

function authorize({ request, actor }: AdminHandlerContext) {
  // Even explicit footer-badges codes or admin.* cannot bypass this policy.
  if (!actor.permissions.includes('*')) {
    return respErr('Forbidden', { status: 403 });
  }
  return enforceMinIntervalRateLimit(request, {
    intervalMs: 200,
    keyPrefix: 'footer-badges-user',
    extraKey: actor.userId,
  });
}

export async function GET(context: AdminHandlerContext) {
  const limited = authorize(context);
  if (limited) return limited;
  const stored = await getStoredFooterBadges();
  return respData(
    stored === undefined
      ? DEFAULT_FOOTER_BADGES
      : parseStoredFooterBadges(stored)
  );
}

export async function POST(context: AdminHandlerContext) {
  const limited = authorize(context);
  if (limited) return limited;
  const body = await context.request.json();
  let badges;
  try {
    badges = validateFooterBadges(body.badges);
  } catch (error) {
    return respErr(
      error instanceof Error ? error.message : 'Invalid footer badges',
      {
        status: 400,
      }
    );
  }
  await saveStoredFooterBadges(JSON.stringify(badges));
  return respData(badges);
}
