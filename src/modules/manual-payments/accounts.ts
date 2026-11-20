import { asc, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { manualPaymentAccount } from '@/config/db/schema';
import { getStorage } from '@/modules/storage/service';
import { getUuid } from '@/lib/hash';

import { ManualPaymentError } from './types';

export type ManualPaymentAccountRow = typeof manualPaymentAccount.$inferSelect;

export type NewAccountInput = {
  channel?: string;
  displayName: string;
  currency?: string;
  qrImageKey?: string | null;
  enabled?: boolean;
  sortOrder?: number;
};

/**
 * A `qrImageKey` may be an absolute URL already, or a storage key for the
 * configured provider. Anything else (storage not configured) resolves to
 * null rather than throwing — the payment page then asks the operator's
 * display name to be used instead of a QR.
 */
export async function resolveQrImageUrl(
  key: string | null | undefined
): Promise<string | null> {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const storage = await getStorage();
  return storage?.getPublicUrl({ key }) ?? null;
}

export async function listAccounts(): Promise<ManualPaymentAccountRow[]> {
  return db()
    .select()
    .from(manualPaymentAccount)
    .orderBy(asc(manualPaymentAccount.sortOrder), asc(manualPaymentAccount.id));
}

export async function listEnabledAccounts(): Promise<
  ManualPaymentAccountRow[]
> {
  const rows = await listAccounts();
  return rows.filter((row) => row.enabled);
}

export async function getAccount(
  id: string
): Promise<ManualPaymentAccountRow | null> {
  const [row] = await db()
    .select()
    .from(manualPaymentAccount)
    .where(eq(manualPaymentAccount.id, id));
  return row ?? null;
}

export async function createAccount(
  input: NewAccountInput
): Promise<ManualPaymentAccountRow> {
  const [row] = await db()
    .insert(manualPaymentAccount)
    .values({
      id: getUuid(),
      channel: input.channel ?? 'alipay',
      displayName: input.displayName,
      currency: input.currency ?? 'cny',
      qrImageKey: input.qrImageKey ?? null,
      enabled: input.enabled ?? false,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return row;
}

export async function updateAccount(
  id: string,
  input: Partial<NewAccountInput>
): Promise<ManualPaymentAccountRow> {
  const [row] = await db()
    .update(manualPaymentAccount)
    .set({
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.qrImageKey !== undefined
        ? { qrImageKey: input.qrImageKey }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(eq(manualPaymentAccount.id, id))
    .returning();
  if (!row) throw new ManualPaymentError('NO_MANUAL_PAYMENT_ACCOUNT');
  return row;
}

/**
 * Refuses to delete an account that any order still references — the FK is
 * `on delete restrict`, so the error surfaces here as a readable code.
 */
export async function deleteAccount(id: string): Promise<void> {
  try {
    await db()
      .delete(manualPaymentAccount)
      .where(eq(manualPaymentAccount.id, id));
  } catch (error) {
    if (/FOREIGN KEY|foreign key|ER_ROW_IS_REFERENCED/i.test(String(error))) {
      throw new ManualPaymentError('ACCOUNT_IN_USE');
    }
    throw error;
  }
}
