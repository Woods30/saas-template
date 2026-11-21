import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
} from '@/modules/manual-payments/service';
import { respData, respErr } from '@/lib/resp';

import type { AdminHandlerContext } from '../types';

/** Admin view: every account, disabled ones included. */
export async function GET() {
  try {
    return respData(await listAccounts());
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}

export async function POST({ request }: AdminHandlerContext) {
  try {
    const input = await request.json();
    const account = await createAccount({
      channel: input.channel,
      displayName: input.displayName,
      currency: input.currency,
      qrImageKey: input.qrImageKey,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
    });
    return respData(account);
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}

export async function PUT({ request }: AdminHandlerContext) {
  try {
    const input = await request.json();
    const account = await updateAccount(input.id, {
      channel: input.channel,
      displayName: input.displayName,
      currency: input.currency,
      qrImageKey: input.qrImageKey,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
    });
    return respData(account);
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}

export async function DELETE({ request }: AdminHandlerContext) {
  try {
    // DELETE is a query-method operation: executeAdmin puts the body in the
    // query string, never in a request body.
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return respErr('id is required');
    await deleteAccount(id);
    return respData({ id });
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}
